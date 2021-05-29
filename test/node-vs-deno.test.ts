import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import { App } from 'aws-cdk-lib';
import * as NodeVsDeno from '../lib/node-vs-deno-stack';

test('Empty Stack', () => {
    const app = new App();
    // WHEN
    const stack = new NodeVsDeno.NodeVsDenoStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
