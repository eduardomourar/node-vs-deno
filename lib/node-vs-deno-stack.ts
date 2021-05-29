import { CfnOutput, Duration, Stack, StackProps  } from "aws-cdk-lib";
import { CfnApplication } from "aws-cdk-lib/aws-sam";
import { AssetCode, Code, Function, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Dashboard, GraphWidget, Metric, MetricProps, SingleValueWidget } from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import * as path from "path";

export class NodeVsDenoStack extends Stack {
  private denoLambda: Function;
  private nodeLambda: Function;
  private testRunnerLambda: Function;
  private table: Table;
  private code: AssetCode;

  constructor(scope: Construct, id: string, private props?: StackProps) {
    super(scope, id, props);

    this.createDynamodb();
    this.createNodeLambda();
    this.createDenoLambda();
    this.createTestRunner();
    this.createDashboard();

    this.table.grantReadWriteData(this.denoLambda);
    this.table.grantReadWriteData(this.nodeLambda);
  }

  private createNodeLambda() {
    this.code = Code.fromAsset(__dirname + "/handlers");
    this.nodeLambda = new Function(this, 'node', {
      code: this.code,
      handler: "node/node.handler",
      runtime: Runtime.NODEJS_14_X,
      memorySize: 1024,
      environment: {
        TABLE: this.table.tableName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1"
      }
    });

  }

  private createDenoLambda() {
    const denoRuntime = new CfnApplication(this, "deno-runtime", {
      location: {
        applicationId:
          "arn:aws:serverlessrepo:us-east-1:390065572566:applications/deno",
        semanticVersion: "1.7.2",
      },
    });
    // Deno Layer
    const layer = LayerVersion.fromLayerVersionArn(
      this,
      "deno-runtime-layer",
      denoRuntime.getAtt("Outputs.LayerArn").toString(),
    );
    this.denoLambda = new Function(this, 'deno', {
      code: Code.fromAsset(path.join(__dirname, "handlers", "deno")),
      handler: "deno.handler",
      runtime: Runtime.PROVIDED_AL2,
      memorySize: 1024,
      environment: {
        TABLE: this.table.tableName
      },
      layers: [
        layer
      ]
    });

  }

  private createTestRunner() {

    this.testRunnerLambda = new Function(this, 'test-runner', {
      environment: {
        NODE_LAMBDA: this.nodeLambda.functionName,
        DENO_LAMBDA: this.denoLambda.functionName
      },
      code: this.code,
      handler: 'node/testrunner.handler',
      runtime: Runtime.NODEJS_14_X,
      timeout: Duration.minutes(15)
    });

    this.nodeLambda.grantInvoke(this.testRunnerLambda);
    this.denoLambda.grantInvoke(this.testRunnerLambda);

    new CfnOutput(this, 'TestRunnerLambda', {
      value: this.testRunnerLambda.functionName
    });
  }

  private createDashboard() {
    const baseMetrics = {
      metricName: '',
      period: Duration.seconds(30),
      statistic: 'p99',
      namespace: "AWS/Lambda"
    };
    const baseDenoMetric: MetricProps = {
      ...baseMetrics,
      dimensions: {
        FunctionName: this.denoLambda.functionName
      }
    };
    const baseNodeMetric: MetricProps = {
      ...baseMetrics,
      dimensions: {
        FunctionName: this.nodeLambda.functionName
      }
    };
    new Dashboard(this, 'dashboard', {
      dashboardName: 'node-vs-deno-perf',
      widgets: [
        [
          new SingleValueWidget({
            title: 'Deno Invocations|Duration|ConcurrentX',
            width: 24,
            height: 4,
            metrics: [
              new Metric({...baseDenoMetric, metricName: "Invocations"}),
              new Metric({...baseDenoMetric, metricName: 'Duration'}),
              new Metric({...baseDenoMetric, metricName: 'ConcurrentExecutions'})
            ]
          })
        ],
        [
          new GraphWidget({
            height: 8,
            width: 8,
            title: 'Deno Invocations',
            left: [
              new Metric({...baseDenoMetric, metricName: 'Invocations'}),
            ],
            liveData: true

          }),
          new GraphWidget({
            height: 8,
            width: 8,
            title: 'Deno Duration',
            left: [
              new Metric({...baseDenoMetric, metricName: 'Duration', statistic: 'Minimum'}),
              new Metric({...baseDenoMetric, metricName: 'Duration', statistic: 'Average'}),
              new Metric({...baseDenoMetric, metricName: 'Duration', statistic: 'Maximum'})
            ],
            liveData: true
          }),
          new GraphWidget({
            height: 8,
            width: 8,
            title: 'Deno ConcurrentX',
            left: [
              new Metric({...baseDenoMetric, metricName: 'ConcurrentX'})
            ],
            liveData: true
          }),
        ],
        [
          new SingleValueWidget({
            title: 'Node Invocations|Duration|ConcurrentX',
            width: 24,
            height: 4,
            metrics: [
              new Metric({...baseNodeMetric, metricName: "Invocations"}),
              new Metric({...baseNodeMetric, metricName: 'Duration'}),
              new Metric({...baseNodeMetric, metricName: 'ConcurrentExecutions'})
            ]
          })
        ],
        [
          new GraphWidget({
            height: 8,
            width: 8,
            title: 'Node Invocations',
            left: [
              new Metric({...baseNodeMetric, metricName: 'Invocations'})
            ],
            liveData: true

          }),
          new GraphWidget({
            height: 8,
            width: 8,
            title: 'Node Duration',
            left: [
              new Metric({...baseNodeMetric, metricName: 'Duration', statistic: 'Minimum'}),
              new Metric({...baseNodeMetric, metricName: 'Duration', statistic: 'Average'}),
              new Metric({...baseNodeMetric, metricName: 'Duration', statistic: 'Maximum'})
            ],
            liveData: true
          }),
          new GraphWidget({
            height: 8,
            width: 8,
            title: 'Node ConcurrentX',
            left: [
              new Metric({...baseNodeMetric, metricName: 'ConcurrentX'})
            ],
            liveData: true
          }),
        ]
      ]
    });
  }

  private createDynamodb() {
    this.table = new Table(this, 'testing-table', {
      partitionKey: {name: 'pk', type: AttributeType.STRING},
      billingMode: BillingMode.PROVISIONED,
      writeCapacity: 15,
      readCapacity: 15
    });
  }
}
