import cdk = require("@aws-cdk/cdk");
import cloudtrail = require("@aws-cdk/aws-cloudtrail");

export class CloudtrailStack extends cdk.Stack {
  constructor(parent: cdk.App, id: string, props?: cdk.StackProps) {
    super(parent, id, props);

    const loggingBucket = new cdk.Parameter(this, "LoggingBucket", {
      description: "The name of the bucket to send cloudtrail logs to",
      type: "String"
    });

    new cdk.Parameter(this, "Unused", {
      description: "An unused parameter to test ref checks",
      type: "String"
    });

    new cloudtrail.CfnTrail(this, "CloudTrail", {
      isLogging: true,
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
      s3BucketName: loggingBucket.ref,
      s3KeyPrefix: "cloudtrails"
    });
  }
}
