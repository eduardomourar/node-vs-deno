#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { NodeVsDenoStack } from '../lib/node-vs-deno-stack';

const app = new App();

new NodeVsDenoStack(app, 'NodeVsDenoStack');
