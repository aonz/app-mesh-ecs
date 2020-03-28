import * as appmesh from '@aws-cdk/aws-appmesh';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecrAssets from '@aws-cdk/aws-ecr-assets';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as iam from '@aws-cdk/aws-iam';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as servicediscovery from '@aws-cdk/aws-servicediscovery';

import * as path from 'path';

export class AppMeshEcsStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Step 3 - ECS + App Mesh with TLS
    const envoyRepository = new ecr.Repository(this, 'EnvoyRepository', {
      repositoryName: 'aws-appmesh-envoy',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    new secretsmanager.Secret(this, 'CaBackendCertSecret',
      { secretName: 'ca_backend_cert' });
    // new secretsmanager.Secret(this, 'BackendCertSecret',
    //   { secretName: 'backend_cert' });
    new secretsmanager.Secret(this, 'BackendKeySecret',
      { secretName: 'backend_key' });
    new secretsmanager.Secret(this, 'BackendCertChainSecret',
      { secretName: 'backend_cert_chain' });
    const account = cdk.Stack.of(this).account;
    const envoyImage =
      `${account}.dkr.ecr.ap-southeast-1.amazonaws.com/aws-appmesh-envoy:v1.12.2.1-prod`;

    // Step 1 - ECS
    const vpc = new ec2.Vpc(this, 'Vpc', { cidr: '20.0.0.0/24', natGateways: 1 });

    const cloudMapNamespace = new servicediscovery.PrivateDnsNamespace(this,
      'PrivateDnsNamespace', { name: 'ecs.local', vpc });

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    // const envoyImage =
    //   '840364872350.dkr.ecr.ap-southeast-1.amazonaws.com/aws-appmesh-envoy:v1.12.2.1-prod';
    const proxyConfiguration = new ecs.AppMeshProxyConfiguration({
      containerName: 'envoy', properties: {
        ignoredUID: 1337, proxyIngressPort: 15000, proxyEgressPort: 15001,
        appPorts: [80], egressIgnoredIPs: ['169.254.170.2', '169.254.169.254']
      }
    });
    const healthCheck = {
      command: ['CMD-SHELL', 'curl -s http://localhost:9901/server_info | grep state | grep -q LIVE'],
      startPeriod: cdk.Duration.seconds(10), interval: cdk.Duration.seconds(5),
      timeout: cdk.Duration.seconds(2), retries: 3
    }
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
    });
    executionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'));
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
    });
    taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'));

    const frontendTaskDefinition =
      new ecs.FargateTaskDefinition(this, 'FrontendTaskDefinition', {
        memoryLimitMiB: 512, cpu: 256, proxyConfiguration, executionRole, taskRole
      });
    const frontendImage = new ecrAssets.DockerImageAsset(this, 'FrontendImage', {
      directory: path.join(__dirname, '../', 'frontend')
    });
    const frontendContainer = frontendTaskDefinition.addContainer('frontend', {
      image: ecs.ContainerImage.fromDockerImageAsset(frontendImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'frontend' })
    });
    frontendContainer.addPortMappings({ containerPort: 80 });
    const frontendEnvoyContainer = frontendTaskDefinition.addContainer('envoy', {
      image: ecs.ContainerImage.fromRegistry(envoyImage),
      environment: {
        'APPMESH_VIRTUAL_NODE_NAME': 'mesh/ecs/virtualNode/frontend',
        'CERTIFICATE_NAME': 'frontend'
      },
      essential: true, user: '1337', healthCheck,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'frontend' })
    });
    frontendEnvoyContainer.addPortMappings({ containerPort: 9901 });
    frontendContainer.addContainerDependencies({
      container: frontendEnvoyContainer, condition: ecs.ContainerDependencyCondition.HEALTHY
    });
    const frontendService = new ecs.FargateService(this, 'FrontendService', {
      cluster, taskDefinition: frontendTaskDefinition, desiredCount: 1,
      serviceName: 'frontend', cloudMapOptions: { name: 'frontend', cloudMapNamespace }
    });

    const lb = new elbv2.ApplicationLoadBalancer(this, 'ALB',
      { vpc, internetFacing: true });
    const listener = lb.addListener('Listener', { port: 80 });
    listener.addTargets('Target', { port: 80, targets: [frontendService] });

    const backendTaskDefinition =
      new ecs.FargateTaskDefinition(this, 'BackendTaskDefinition', {
        memoryLimitMiB: 512, cpu: 256, proxyConfiguration, executionRole, taskRole
      });
    const backendImage = new ecrAssets.DockerImageAsset(this, 'BackendImage', {
      directory: path.join(__dirname, '../', 'backend')
    });
    const backendContainer = backendTaskDefinition.addContainer('backend', {
      image: ecs.ContainerImage.fromDockerImageAsset(backendImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'backend' })
    });
    backendContainer.addPortMappings({ containerPort: 80 });
    const backendEnvoyContainer = backendTaskDefinition.addContainer('envoy', {
      image: ecs.ContainerImage.fromRegistry(envoyImage),
      environment: {
        'APPMESH_VIRTUAL_NODE_NAME': 'mesh/ecs/virtualNode/backend',
        'CERTIFICATE_NAME': 'backend'
      },
      essential: true, user: '1337', healthCheck,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'backend' })
    });
    backendEnvoyContainer.addPortMappings({ containerPort: 9901 });
    backendContainer.addContainerDependencies({
      container: backendEnvoyContainer, condition: ecs.ContainerDependencyCondition.HEALTHY
    });
    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc, allowAllOutbound: true
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Port 80');
    new ecs.FargateService(this, 'BackendService', {
      cluster, taskDefinition: backendTaskDefinition, desiredCount: 1,
      serviceName: 'backend', cloudMapOptions: { name: 'backend', cloudMapNamespace },
      securityGroup
    });

    // Step 2 - ECS + App Mesh
    const mesh = new appmesh.Mesh(this, 'AppMesh', { meshName: 'ecs' });
    const frontendVirtualRouter = mesh.addVirtualRouter('FrontendVirtualRouter', {
      virtualRouterName: 'frontend',
      listener: { portMapping: { port: 80, protocol: appmesh.Protocol.HTTP } }
    })
    const backendVirtualRouter = mesh.addVirtualRouter('BackendVirtualRouter', {
      virtualRouterName: 'backend',
      listener: { portMapping: { port: 80, protocol: appmesh.Protocol.HTTP } }
    })
    mesh.addVirtualService('FrontendVirtualService', {
      virtualServiceName: 'frontend.ecs.local', virtualRouter: frontendVirtualRouter
    });
    const backendVirtualService = mesh.addVirtualService('BackendVirtualService', {
      virtualServiceName: 'backend.ecs.local', virtualRouter: backendVirtualRouter
    });
    const frontendVirtualNode = mesh.addVirtualNode('FrontendVirtualNode', {
      virtualNodeName: 'frontend', dnsHostName: 'frontend.ecs.local',
      listener: { portMapping: { port: 80, protocol: appmesh.Protocol.HTTP } },
      backends: [backendVirtualService]
    });
    const frontendCfnVirtualNode = frontendVirtualNode.node.defaultChild as appmesh.CfnVirtualNode;
    frontendCfnVirtualNode.addPropertyOverride('Spec.BackendDefaults', {
      ClientPolicy: {
        TLS: {
          Validation: {
            Trust: {
              File: {
                CertificateChain: '/keys/ca_backend_cert.pem'
              }
            }
          }
        }
      }
    });
    const backendVirtualNode = mesh.addVirtualNode('BackendVirtualNode', {
      virtualNodeName: 'backend', dnsHostName: 'backend.ecs.local',
      listener: { portMapping: { port: 80, protocol: appmesh.Protocol.HTTP } }
    });
    const backendCfnVirtualNode = backendVirtualNode.node.defaultChild as appmesh.CfnVirtualNode;
    backendCfnVirtualNode.addPropertyOverride('Spec.Listeners', [
      {
        PortMapping: {
          Port: 80,
          Protocol: 'http'
        },
        TLS: {
          Mode: 'STRICT',
          Certificate: {
            File: {
              PrivateKey: '/keys/backend_key.pem',
              CertificateChain: '/keys/backend_cert_chain.pem'
            }
          }
        }
      }
    ]);
    frontendVirtualRouter.addRoute('FrontendRoute', {
      routeName: 'frontend', routeType: appmesh.RouteType.HTTP,
      routeTargets: [{ virtualNode: frontendVirtualNode, weight: 100 }],
    });
    backendVirtualRouter.addRoute('BackendRoute', {
      routeName: 'backend', routeType: appmesh.RouteType.HTTP,
      routeTargets: [{ virtualNode: backendVirtualNode, weight: 100 }]
    });
  }
}
