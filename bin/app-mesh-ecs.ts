#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { AppMeshEcsStack } from '../lib/app-mesh-ecs-stack';

const app = new cdk.App();
new AppMeshEcsStack(app, 'AppMeshEcsStack');
