import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecrAssets from '@aws-cdk/aws-ecr-assets';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as servicediscovery from '@aws-cdk/aws-servicediscovery';

import * as path from 'path';

export class AppMeshEcsStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Step 1 - ECS
    const vpc = new ec2.Vpc(this, 'Vpc', { cidr: '20.0.0.0/24', natGateways: 1 });

    const cloudMapNamespace = new servicediscovery.PrivateDnsNamespace(this,
      'PrivateDnsNamespace', { name: 'ecs.local', vpc });

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    const frontendTaskDefinition =
      new ecs.FargateTaskDefinition(this, 'FrontendTaskDefinition', {
        memoryLimitMiB: 512, cpu: 256
      });
    const frontendImage = new ecrAssets.DockerImageAsset(this, 'FrontendImage', {
      directory: path.join(__dirname, '../', 'frontend')
    });
    const frontendContainer = frontendTaskDefinition
      .addContainer('FrontendContainer', {
        image: ecs.ContainerImage.fromDockerImageAsset(frontendImage)
      });
    frontendContainer.addPortMappings({ containerPort: 80 });
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
        memoryLimitMiB: 512, cpu: 256
      });
    const backendImage = new ecrAssets.DockerImageAsset(this, 'BackendImage', {
      directory: path.join(__dirname, '../', 'backend')
    });
    const backendContainer = backendTaskDefinition
      .addContainer('BackendContainer', {
        image: ecs.ContainerImage.fromDockerImageAsset(backendImage)
      });
    backendContainer.addPortMappings({ containerPort: 80 });
    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc, allowAllOutbound: true
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Port 80');
    new ecs.FargateService(this, 'BackendService', {
      cluster, taskDefinition: backendTaskDefinition, desiredCount: 1,
      serviceName: 'backend', cloudMapOptions: { name: 'backend', cloudMapNamespace },
      securityGroup
    });
  }
}
