import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import * as s3 from "@aws-cdk/aws-s3";
import * as autoscaling from "@aws-cdk/aws-autoscaling";
import * as sns from "@aws-cdk/aws-sns";
import * as cloudwatch from "@aws-cdk/aws-cloudwatch";
import * as lambda from "@aws-cdk/aws-lambda";
import * as events from "@aws-cdk/aws-events";

export class BuildkiteStack extends cdk.Stack {
  constructor(parent: cdk.App, id: string, props?: cdk.StackProps) {
    super(parent, id, props);

    this.templateOptions.templateFormatVersion = "2010-09-09";
    this.templateOptions.description = "Buildkite stack v4.0.2";
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: { default: "Buildkite Configuration" },
            Parameters: ["BuildkiteAgentToken", "BuildkiteQueue"]
          },
          {
            Label: { default: "Advanced Buildkite Configuration" },
            Parameters: [
              "BuildkiteAgentRelease",
              "BuildkiteAgentTags",
              "BuildkiteAgentTimestampLines",
              "BuildkiteAgentExperiments"
            ]
          },
          {
            Label: { default: "Network Configuration" },
            Parameters: [
              "VpcId",
              "Subnets",
              "AvailabilityZones",
              "SecurityGroupId",
              "AssociatePublicIpAddress"
            ]
          },
          {
            Label: { default: "Instance Configuration" },
            Parameters: [
              "ImageId",
              "InstanceType",
              "AgentsPerInstance",
              "KeyName",
              "SpotPrice",
              "SecretsBucket",
              "ArtifactsBucket",
              "AuthorizedUsersUrl",
              "BootstrapScriptUrl",
              "RootVolumeSize",
              "ManagedPolicyARN",
              "InstanceRoleName"
            ]
          },
          {
            Label: { default: "Auto-scaling Configuration" },
            Parameters: [
              "MinSize",
              "MaxSize",
              "ScaleUpAdjustment",
              "ScaleDownAdjustment",
              "ScaleDownPeriod",
              "InstanceCreationTimeout"
            ]
          },
          {
            Label: { default: "Cost Allocation Configuration" },
            Parameters: [
              "EnableCostAllocationTags",
              "CostAllocationTagName",
              "CostAllocationTagValue"
            ]
          },
          {
            Label: { default: "Docker Daemon Configuration" },
            Parameters: [
              "EnableDockerUserNamespaceRemap",
              "EnableDockerExperimental"
            ]
          },
          {
            Label: { default: "Docker Registry Configuration" },
            Parameters: ["ECRAccessPolicy"]
          },
          {
            Label: { default: "Plugin Configuration" },
            Parameters: [
              "EnableSecretsPlugin",
              "EnableECRPlugin",
              "EnableDockerLoginPlugin"
            ]
          }
        ]
      }
    };

    const keyName = new cdk.CfnParameter(this, "KeyName", {
      description:
        "Optional - SSH keypair used to access the buildkite instances, setting this will enable SSH ingress",
      type: "String",
      default: ""
    });

    const buildkiteAgentRelease = new cdk.CfnParameter(
      this,
      "BuildkiteAgentRelease",
      {
        type: "String",
        allowedValues: ["stable", "beta", "edge"],
        default: "stable"
      }
    );

    const buildkiteAgentToken = new cdk.CfnParameter(
      this,
      "BuildkiteAgentToken",
      {
        description: "Buildkite agent registration token",
        type: "String",
        noEcho: true,
        minLength: 1
      }
    );

    const buildkiteAgentTags = new cdk.CfnParameter(
      this,
      "BuildkiteAgentTags",
      {
        description:
          "Additional tags seperated by commas to provide to the agent. E.g os=linux,llamas=always",
        type: "String",
        default: ""
      }
    );

    const buildkiteAgentTimestampLines = new cdk.CfnParameter(
      this,
      "BuildkiteAgentTimestampLines",
      {
        description:
          "Set to true to prepend timestamps to every line of output",
        type: "String",
        allowedValues: ["true", "false"],
        default: "false"
      }
    );

    const buildkiteAgentExperiments = new cdk.CfnParameter(
      this,
      "BuildkiteAgentExperiments",
      {
        description:
          "Agent experiments to enable, comma delimited. See https://github.com/buildkite/agent/blob/master/EXPERIMENTS.md.",
        type: "String",
        default: ""
      }
    );

    const buildkiteQueue = new cdk.CfnParameter(this, "BuildkiteQueue", {
      description:
        'Queue name that agents will use, targeted in pipeline steps using "queue={value}"',
      type: "String",
      default: "default",
      minLength: 1
    });

    const agentsPerInstance = new cdk.CfnParameter(this, "AgentsPerInstance", {
      description: "Number of Buildkite agents to run on each instance",
      type: "Number",
      default: 1,
      minValue: 1
    });

    const secretsBucket = new cdk.CfnParameter(this, "SecretsBucket", {
      description:
        "Optional - Name of an existing S3 bucket containing pipeline secrets (Created if left blank)",
      type: "String",
      default: ""
    });

    const artifactsBucket = new cdk.CfnParameter(this, "ArtifactsBucket", {
      description:
        "Optional - Name of an existing S3 bucket for build artifact storage",
      type: "String",
      default: ""
    });

    const bootstrapScriptUrl = new cdk.CfnParameter(
      this,
      "BootstrapScriptUrl",
      {
        description:
          "Optional - HTTPS or S3 URL to run on each instance during boot",
        type: "String",
        default: ""
      }
    );

    const authorizedUsersUrl = new cdk.CfnParameter(
      this,
      "AuthorizedUsersUrl",
      {
        description:
          "Optional - HTTPS or S3 URL to periodically download ssh authorized_keys from, setting this will enable SSH ingress",
        type: "String",
        default: ""
      }
    );

    const vpcId = new cdk.CfnParameter(this, "VpcId", {
      type: "String",
      description:
        "Optional - Id of an existing VPC to launch instances into. Leave blank to have a new VPC created",
      default: ""
    });

    const subnets = new cdk.CfnParameter(this, "Subnets", {
      type: "CommaDelimitedList",
      description:
        "Optional - Comma separated list of two existing VPC subnet ids where EC2 instances will run. Required if setting VpcId.",
      default: ""
    });

    const availabilityZones = new cdk.CfnParameter(this, "AvailabilityZones", {
      type: "CommaDelimitedList",
      description:
        "Optional - Comma separated list of AZs that subnets are created in (if Subnets parameter is not specified)",
      default: ""
    });

    const instanceType = new cdk.CfnParameter(this, "InstanceType", {
      description: "Instance type",
      type: "String",
      default: "t2.nano",
      minLength: 1
    });

    const spotPrice = new cdk.CfnParameter(this, "SpotPrice", {
      description:
        "Spot bid price to use for the instances. 0 means normal (non-spot) instances",
      type: "String",
      default: 0
    });

    const maxSize = new cdk.CfnParameter(this, "MaxSize", {
      description: "Maximum number of instances",
      type: "Number",
      default: 10,
      minValue: 1
    });

    const minSize = new cdk.CfnParameter(this, "MinSize", {
      description: "Minimum number of instances",
      type: "Number",
      default: 0
    });

    const scaleUpAdjustment = new cdk.CfnParameter(this, "ScaleUpAdjustment", {
      description:
        "Number of instances to add on scale up events (ScheduledJobsCount > 0 for 1 min)",
      type: "Number",
      default: 5,
      minValue: 0
    });

    const scaleDownAdjustment = new cdk.CfnParameter(
      this,
      "ScaleDownAdjustment",
      {
        description:
          "Number of instances to remove on scale down events (UnfinishedJobs == 0 for ScaleDownPeriod)",
        type: "Number",
        default: -1,
        maxValue: 0
      }
    );

    const scaleDownPeriod = new cdk.CfnParameter(this, "ScaleDownPeriod", {
      description:
        "Number of seconds UnfinishedJobs must equal 0 before scale down",
      type: "Number",
      default: 1800
    });

    const instanceCreationTimeout = new cdk.CfnParameter(
      this,
      "InstanceCreationTimeout",
      {
        description: "Timeout period for Autoscaling Group Creation Policy",
        type: "String",
        default: "PT5M"
      }
    );

    const rootVolumeSize = new cdk.CfnParameter(this, "RootVolumeSize", {
      description: "Size of each instance's root EBS volume (in GB)",
      type: "Number",
      default: 250,
      minValue: 10
    });

    const securityGroupId = new cdk.CfnParameter(this, "SecurityGroupId", {
      type: "String",
      description: "Optional - Security group id to assign to instances",
      default: ""
    });

    const imageId = new cdk.CfnParameter(this, "ImageId", {
      type: "String",
      description:
        "Optional - Custom AMI to use for instances (must be based on the stack's AMI)",
      default: ""
    });

    const managedPolicyArn = new cdk.CfnParameter(this, "ManagedPolicyARN", {
      type: "CommaDelimitedList",
      description:
        "Optional - Comma separated list of managed IAM policy ARNs to attach to the instance role",
      default: ""
    });

    const instanceRoleName = new cdk.CfnParameter(this, "InstanceRoleName", {
      type: "String",
      description:
        "Optional - A name for the IAM Role attached to the Instance Profile",
      default: ""
    });

    const ecrAccessPolicy = new cdk.CfnParameter(this, "ECRAccessPolicy", {
      type: "String",
      description: "ECR access policy to give container instances",
      allowedValues: ["none", "readonly", "poweruser", "full"],
      default: "none"
    });

    const associatePublicIpAddress = new cdk.CfnParameter(
      this,
      "AssociatePublicIpAddress",
      {
        type: "String",
        description: "Associate instances with public IP addresses",
        allowedValues: ["true", "false"],
        default: "true"
      }
    );

    const enableSecretsPlugin = new cdk.CfnParameter(
      this,
      "EnableSecretsPlugin",
      {
        type: "String",
        description: "Enables s3-secrets plugin for all pipelines",
        allowedValues: ["true", "false"],
        default: "true"
      }
    );

    const enableEcrPlugin = new cdk.CfnParameter(this, "EnableECRPlugin", {
      type: "String",
      description: "Enables ecr plugin for all pipelines",
      allowedValues: ["true", "false"],
      default: "true"
    });

    const enableDockerLoginPlugin = new cdk.CfnParameter(
      this,
      "EnableDockerLoginPlugin",
      {
        type: "String",
        description: "Enables docker-login plugin for all pipelines",
        allowedValues: ["true", "false"],
        default: "true"
      }
    );

    const enableDockerUserNamespaceRemap = new cdk.CfnParameter(
      this,
      "EnableDockerUserNamespaceRemap",
      {
        type: "String",
        description:
          "Enables Docker user namespace remapping so docker runs as buildkite-agent",
        allowedValues: ["true", "false"],
        default: "true"
      }
    );

    const enableDockerExperimental = new cdk.CfnParameter(
      this,
      "EnableDockerExperimental",
      {
        type: "String",
        description: "Enables Docker experimental features",
        allowedValues: ["true", "false"],
        default: "false"
      }
    );

    const enableCostAllocationTags = new cdk.CfnParameter(
      this,
      "EnableCostAllocationTags",
      {
        type: "String",
        description:
          "Enables AWS Cost Allocation tags for all resources in the stack. See https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-alloc-tags.html",
        allowedValues: ["true", "false"],
        default: "false"
      }
    );

    const costAllocationTagName = new cdk.CfnParameter(
      this,
      "CostAllocationTagName",
      {
        type: "String",
        description:
          "The name of the Cost Allocation Tag used for billing purposes",
        default: "aws:createdBy"
      }
    );

    const costAllocationTagValue = new cdk.CfnParameter(
      this,
      "CostAllocationTagValue",
      {
        type: "String",
        description:
          "The value of the Cost Allocation Tag used for billing purposes",
        default: "buildkite-elastic-ci-stack-for-aws"
      }
    );

    new cdk.CfnMapping(this, "ECRManagedPolicy", {
      mapping: {
        none: { Policy: "" },
        readonly: {
          Policy: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
        },
        poweruser: {
          Policy: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser"
        },
        full: {
          Policy: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess"
        }
      }
    });

    new cdk.CfnMapping(this, "MetricsLambdaBucket", {
      mapping: {
        "us-east-1": { Bucket: "buildkite-metrics" },
        "us-east-2": { Bucket: "buildkite-metrics-us-east-2" },
        "us-west-1": { Bucket: "buildkite-metrics-us-west-1" },
        "us-west-2": { Bucket: "buildkite-metrics-us-west-2" },
        "eu-west-1": { Bucket: "buildkite-metrics-eu-west-1" },
        "eu-west-2": { Bucket: "buildkite-metrics-eu-west-2" },
        "eu-central-1": { Bucket: "buildkite-metrics-eu-central-1" },
        "ap-northeast-1": { Bucket: "buildkite-metrics-ap-northeast-1" },
        "ap-northeast-2": { Bucket: "buildkite-metrics-ap-northeast-2" },
        "ap-southeast-1": { Bucket: "buildkite-metrics-ap-southeast-1" },
        "ap-southeast-2": { Bucket: "buildkite-metrics-ap-southeast-2" },
        "ap-south-1": { Bucket: "buildkite-metrics-ap-south-1" },
        "sa-east-1": { Bucket: "buildkite-metrics-sa-east-1" }
      }
    });

    new cdk.CfnMapping(this, "AWSRegion2AMI", {
      mapping: {
        "us-east-1": { AMI: "ami-08361b08a1bdc52ce" },
        "us-east-2": { AMI: "ami-0de84efc5bd5d8f45" },
        "us-west-1": { AMI: "ami-0d7b8f53098f0832e" },
        "us-west-2": { AMI: "ami-024906a3f49a723c0" },
        "eu-west-1": { AMI: "ami-081315bd246893405" },
        "eu-west-2": { AMI: "ami-0d8ad4c20a873b867" },
        "eu-central-1": { AMI: "ami-03889b1fc23df65d7" },
        "ap-northeast-1": { AMI: "ami-07e9586052fa7e87b" },
        "ap-northeast-2": { AMI: "ami-0846198638b500217" },
        "ap-southeast-1": { AMI: "ami-0a298ef89b00a97b9" },
        "ap-southeast-2": { AMI: "ami-0a541d0604bff3890" },
        "ap-south-1": { AMI: "ami-0283d0ab170de1f81" },
        "sa-east-1": { AMI: "ami-06e329498e6ae405b" }
      }
    });

    const useSpotInstances = new cdk.CfnCondition(this, "UseSpotInstances", {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(
        spotPrice.value as any,
        0
      ) as any) as any
    });

    const createVpcResources = new cdk.CfnCondition(
      this,
      "CreateVpcResources",
      { expression: cdk.Fn.conditionEquals(vpcId.value as any, "") as any }
    );

    const createSecurityGroup = new cdk.CfnCondition(
      this,
      "CreateSecurityGroup",
      {
        expression: cdk.Fn.conditionEquals(
          securityGroupId.value as any,
          ""
        ) as any
      }
    );

    const createSecretsBucket = new cdk.CfnCondition(
      this,
      "CreateSecretsBucket",
      {
        expression: cdk.Fn.conditionEquals(
          secretsBucket.value as any,
          ""
        ) as any
      }
    );

    const setInstanceRoleName = new cdk.CfnCondition(
      this,
      "SetInstanceRoleName",
      {
        expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(
          instanceRoleName.value as any,
          ""
        ) as any) as any
      }
    );

    const useSpecifiedSecretsBucket = new cdk.CfnCondition(
      this,
      "UseSpecifiedSecretsBucket",
      {
        expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(
          secretsBucket.value as any,
          ""
        ) as any) as any
      }
    );

    const useSpecifiedAvailabilityZones = new cdk.CfnCondition(
      this,
      "UseSpecifiedAvailabilityZones",
      {
        expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(
          cdk.Fn.join("", availabilityZones.value as any) as any,
          ""
        ) as any) as any
      }
    );

    const useArtifactsBucket = new cdk.CfnCondition(
      this,
      "UseArtifactsBucket",
      {
        expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(
          artifactsBucket.value as any,
          ""
        ) as any) as any
      }
    );

    const useDefaultAmi = new cdk.CfnCondition(this, "UseDefaultAMI", {
      expression: cdk.Fn.conditionEquals(imageId.value as any, "") as any
    });

    const useManagedPolicyArn = new cdk.CfnCondition(
      this,
      "UseManagedPolicyARN",
      {
        expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(
          cdk.Fn.join("", managedPolicyArn.value as any) as any,
          ""
        ) as any) as any
      }
    );

    const useEcr = new cdk.CfnCondition(this, "UseECR", {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(
        ecrAccessPolicy.value as any,
        "none"
      ) as any) as any
    });

    const useAutoscaling = new cdk.CfnCondition(this, "UseAutoscaling", {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(
        maxSize.value as any,
        minSize.value as any
      ) as any) as any
    });

    const createMetricsStack = new cdk.CfnCondition(
      this,
      "CreateMetricsStack",
      { expression: useAutoscaling }
    );

    const useCostAllocationTags = new cdk.CfnCondition(
      this,
      "UseCostAllocationTags",
      {
        expression: cdk.Fn.conditionEquals(
          enableCostAllocationTags.value as any,
          "true"
        ) as any
      }
    );

    const hasKeyName = new cdk.CfnCondition(this, "HasKeyName", {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(
        keyName.value as any,
        ""
      ) as any) as any
    });

    const enableSshIngress = new cdk.CfnCondition(this, "EnableSshIngress", {
      expression: cdk.Fn.conditionAnd(createSecurityGroup, cdk.Fn.conditionOr(
        hasKeyName,
        cdk.Fn.conditionNot(cdk.Fn.conditionEquals(
          authorizedUsersUrl.value as any,
          ""
        ) as any) as any
      ) as any) as any
    });

    const hasManagedPolicies = new cdk.CfnCondition(
      this,
      "HasManagedPolicies",
      { expression: cdk.Fn.conditionOr(useManagedPolicyArn, useEcr) as any }
    );

    const lambdaExecutionRole = new iam.CfnRole(this, "LambdaExecutionRole", {
      assumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: ["lambda.amazonaws.com"] },
            Action: ["sts:AssumeRole"]
          }
        ]
      },
      path: "/"
    });
    lambdaExecutionRole.cfnOptions.condition = createMetricsStack;

    const lambdaExecutionPolicy = new iam.CfnPolicy(
      this,
      "LambdaExecutionPolicy",
      {
        policyName: "AccessToCloudwatchForBuildkiteMetrics",
        roles: [lambdaExecutionRole.ref],
        policyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "cloudwatch:PutMetricData"
              ],
              Resource: ["*"]
            }
          ]
        }
      }
    );
    lambdaExecutionPolicy.cfnOptions.condition = createMetricsStack;

    const buildkiteMetricsFunction = new lambda.CfnFunction(
      this,
      "BuildkiteMetricsFunction",
      {
        code: {
          s3Bucket: cdk.Fn.findInMap(
            "MetricsLambdaBucket",
            cdk.Aws.REGION,
            "Bucket"
          ) as any,
          s3Key: "buildkite-metrics-v3.0.0-lambda.zip"
        },
        role: lambdaExecutionRole.attrArn,
        timeout: 120,
        handler: "handler.handle",
        runtime: "python2.7",
        memorySize: 128,
        environment: {
          variables: {
            BUILDKITE_AGENT_TOKEN: buildkiteAgentToken.value as any,
            BUILDKITE_QUEUE: buildkiteQueue.value as any,
            AWS_STACK_ID: cdk.Aws.STACK_ID,
            AWS_STACK_NAME: cdk.Aws.STACK_NAME,
            AWS_ACCOUNT_ID: cdk.Aws.ACCOUNT_ID
          }
        }
      }
    );
    buildkiteMetricsFunction.cfnOptions.condition = createMetricsStack;
    buildkiteMetricsFunction.addDependsOn(lambdaExecutionPolicy);

    const scheduledRule = new events.CfnRule(this, "ScheduledRule", {
      description: "ScheduledRule",
      scheduleExpression: "rate(1 minute)",
      state: "ENABLED",
      targets: [
        {
          arn: buildkiteMetricsFunction.attrArn,
          id: "TargetBuildkiteMetricsFunction"
        }
      ]
    });
    scheduledRule.cfnOptions.condition = createMetricsStack;

    const permissionForEventsToInvokeLambda = new lambda.CfnPermission(
      this,
      "PermissionForEventsToInvokeLambda",
      {
        functionName: buildkiteMetricsFunction.ref,
        action: "lambda:InvokeFunction",
        principal: "events.amazonaws.com",
        sourceArn: scheduledRule.attrArn
      }
    );
    permissionForEventsToInvokeLambda.cfnOptions.condition = createMetricsStack;

    const managedSecretsLoggingBucket = new s3.CfnBucket(
      this,
      "ManagedSecretsLoggingBucket",
      { accessControl: "LogDeliveryWrite" }
    );
    managedSecretsLoggingBucket.cfnOptions.deletionPolicy =
      cdk.CfnDeletionPolicy.RETAIN;
    managedSecretsLoggingBucket.cfnOptions.condition = createSecretsBucket;

    const managedSecretsBucket = new s3.CfnBucket(
      this,
      "ManagedSecretsBucket",
      {
        loggingConfiguration: {
          destinationBucketName: managedSecretsLoggingBucket.ref
        },
        versioningConfiguration: { status: "Enabled" }
      }
    );
    managedSecretsBucket.cfnOptions.deletionPolicy =
      cdk.CfnDeletionPolicy.RETAIN;
    managedSecretsBucket.cfnOptions.condition = createSecretsBucket;

    const iamRole = new iam.CfnRole(this, "IAMRole", {
      roleName: cdk.Fn.conditionIf(
        "SetInstanceRoleName",
        instanceRoleName.value as any,
        cdk.Fn.sub("${AWS::StackName}-Role") as any
      ) as any,
      managedPolicyArns: cdk.Fn.conditionIf(
        "HasManagedPolicies",
        cdk.Fn.split(",", cdk.Fn.join(",", [
          cdk.Fn.conditionIf(
            "UseECR",
            cdk.Fn.findInMap(
              "ECRManagedPolicy",
              ecrAccessPolicy.value as any,
              "Policy"
            ) as any,
            cdk.Aws.NO_VALUE
          ) as any,
          cdk.Fn.conditionIf(
            "UseManagedPolicyARN",
            cdk.Fn.join(",", managedPolicyArn.value as any) as any,
            cdk.Aws.NO_VALUE
          ) as any
        ]) as any) as any,
        cdk.Aws.NO_VALUE
      ) as any,
      assumeRolePolicyDocument: {
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: ["autoscaling.amazonaws.com", "ec2.amazonaws.com"]
            },
            Action: "sts:AssumeRole"
          }
        ]
      },
      path: "/"
    });

    const iamInstanceProfile = new iam.CfnInstanceProfile(
      this,
      "IAMInstanceProfile",
      { path: "/", roles: [iamRole.ref] }
    );

    const vpc = new ec2.CfnVPC(this, "Vpc", {
      cidrBlock: "10.0.0.0/16",
      instanceTenancy: "default",
      tags: [{ key: "Name", value: cdk.Aws.STACK_NAME }]
    });
    vpc.cfnOptions.condition = createVpcResources;

    const securityGroup = new ec2.CfnSecurityGroup(this, "SecurityGroup", {
      groupDescription: "Enable access to agents",
      vpcId: cdk.Fn.conditionIf(
        "CreateVpcResources",
        vpc.ref,
        vpcId.value as any
      ) as any,
      tags: [{ key: "Name", value: cdk.Aws.STACK_NAME }]
    });
    securityGroup.cfnOptions.condition = createSecurityGroup;

    const agentLaunchConfiguration = new autoscaling.CfnLaunchConfiguration(
      this,
      "AgentLaunchConfiguration",
      {
        associatePublicIpAddress: associatePublicIpAddress.value as any,
        securityGroups: [
          cdk.Fn.conditionIf(
            "CreateSecurityGroup",
            securityGroup.ref,
            securityGroupId.value as any
          ) as any
        ],
        keyName: cdk.Fn.conditionIf(
          "HasKeyName",
          keyName.value as any,
          cdk.Aws.NO_VALUE
        ) as any,
        iamInstanceProfile: iamInstanceProfile.ref,
        instanceType: instanceType.value as any,
        spotPrice: cdk.Fn.conditionIf(
          "UseSpotInstances",
          spotPrice.value as any,
          cdk.Aws.NO_VALUE
        ) as any,
        imageId: cdk.Fn.conditionIf(
          "UseDefaultAMI",
          cdk.Fn.findInMap("AWSRegion2AMI", cdk.Aws.REGION, "AMI") as any,
          imageId.value as any
        ) as any,
        blockDeviceMappings: [
          {
            deviceName: "/dev/xvda",
            ebs: { volumeSize: rootVolumeSize.value as any, volumeType: "gp2" }
          }
        ],
        userData: cdk.Fn.base64(cdk.Fn.sub(
          'Content-Type: multipart/mixed; boundary="==BOUNDARY=="\nMIME-Version: 1.0\n--==BOUNDARY==\nContent-Type: text/cloud-boothook; charset="us-ascii"\nDOCKER_USERNS_REMAP=${EnableDockerUserNamespaceRemap} \\\nDOCKER_EXPERIMENTAL=${EnableDockerExperimental} \\\n  /usr/local/bin/bk-configure-docker.sh\n\n--==BOUNDARY==\nContent-Type: text/x-shellscript; charset="us-ascii"\n#!/bin/bash -xv\nBUILDKITE_STACK_NAME="${AWS::StackName}" \\\nBUILDKITE_STACK_VERSION=v4.0.2 \\\nBUILDKITE_SECRETS_BUCKET="${LocalSecretsBucket}" \\\nBUILDKITE_AGENT_TOKEN="${BuildkiteAgentToken}" \\\nBUILDKITE_AGENTS_PER_INSTANCE="${AgentsPerInstance}" \\\nBUILDKITE_AGENT_TAGS="${BuildkiteAgentTags}" \\\nBUILDKITE_AGENT_TIMESTAMP_LINES="${BuildkiteAgentTimestampLines}" \\\nBUILDKITE_AGENT_EXPERIMENTS="${BuildkiteAgentExperiments}" \\\nBUILDKITE_AGENT_RELEASE="${BuildkiteAgentRelease}" \\\nBUILDKITE_QUEUE="${BuildkiteQueue}" \\\nBUILDKITE_ELASTIC_BOOTSTRAP_SCRIPT="${BootstrapScriptUrl}" \\\nBUILDKITE_AUTHORIZED_USERS_URL="${AuthorizedUsersUrl}" \\\nBUILDKITE_ECR_POLICY=${ECRAccessPolicy} \\\nBUILDKITE_LIFECYCLE_TOPIC=${AgentLifecycleTopic} \\\nAWS_DEFAULT_REGION=${AWS::Region} \\\nSECRETS_PLUGIN_ENABLED=${EnableSecretsPlugin} \\\nECR_PLUGIN_ENABLED=${EnableECRPlugin} \\\nDOCKER_LOGIN_PLUGIN_ENABLED=${EnableDockerLoginPlugin} \\\nAWS_REGION=${AWS::Region} \\\n  /usr/local/bin/bk-install-elastic-stack.sh\n--==BOUNDARY==--\n',
          {
            LocalSecretsBucket: cdk.Fn.conditionIf(
              "CreateSecretsBucket",
              managedSecretsBucket.ref,
              secretsBucket.value as any
            ) as any
          }
        ) as any) as any
      }
    );

    const subnet1 = new ec2.CfnSubnet(this, "Subnet1", {
      availabilityZone: cdk.Fn.conditionIf(
        "UseSpecifiedAvailabilityZones",
        cdk.Fn.select(1, availabilityZones.value as any) as any,
        cdk.Fn.select(1, cdk.Fn.getAzs("") as any) as any
      ) as any,
      cidrBlock: "10.0.2.0/24",
      vpcId: vpc.ref,
      tags: [{ key: "Name", value: cdk.Aws.STACK_NAME }]
    });
    subnet1.cfnOptions.condition = createVpcResources;

    const subnet0 = new ec2.CfnSubnet(this, "Subnet0", {
      availabilityZone: cdk.Fn.conditionIf(
        "UseSpecifiedAvailabilityZones",
        cdk.Fn.select(0, availabilityZones.value as any) as any,
        cdk.Fn.select(0, cdk.Fn.getAzs("") as any) as any
      ) as any,
      cidrBlock: "10.0.1.0/24",
      vpcId: vpc.ref,
      tags: [{ key: "Name", value: cdk.Aws.STACK_NAME }]
    });
    subnet0.cfnOptions.condition = createVpcResources;

    const agentAutoScaleGroup = new autoscaling.CfnAutoScalingGroup(
      this,
      "AgentAutoScaleGroup",
      {
        vpcZoneIdentifier: cdk.Fn.conditionIf(
          "CreateVpcResources",
          [subnet0.ref, subnet1.ref],
          subnets.value as any
        ) as any,
        launchConfigurationName: agentLaunchConfiguration.ref,
        minSize: minSize.value as any,
        maxSize: maxSize.value as any,
        metricsCollection: [
          {
            granularity: "1Minute",
            metrics: [
              "GroupMinSize",
              "GroupMaxSize",
              "GroupInServiceInstances",
              "GroupTerminatingInstances",
              "GroupPendingInstances"
            ]
          }
        ],
        terminationPolicies: [
          "OldestLaunchConfiguration",
          "ClosestToNextInstanceHour"
        ],
        tags: [
          { key: "Role", value: "buildkite-agent", propagateAtLaunch: true },
          { key: "Name", value: "buildkite-agent", propagateAtLaunch: true },
          {
            key: "BuildkiteAgentRelease",
            value: buildkiteAgentRelease.value as any,
            propagateAtLaunch: true
          },
          {
            key: "BuildkiteQueue",
            value: buildkiteQueue.value as any,
            propagateAtLaunch: true
          }
        ]
      }
    );
    agentAutoScaleGroup.cfnOptions.creationPolicy = {
      resourceSignal: {
        timeout: instanceCreationTimeout.value as any,
        count: minSize.value as any
      }
    };
    agentAutoScaleGroup.cfnOptions.updatePolicy = {
      autoScalingReplacingUpdate: { willReplace: true }
    };

    const agentScaleDownPolicy = new autoscaling.CfnScalingPolicy(
      this,
      "AgentScaleDownPolicy",
      {
        adjustmentType: "ChangeInCapacity",
        autoScalingGroupName: agentAutoScaleGroup.ref,
        cooldown: "300",
        scalingAdjustment: scaleDownAdjustment.value as any
      }
    );
    agentScaleDownPolicy.cfnOptions.condition = useAutoscaling;

    const agentUtilizationAlarmLow = new cloudwatch.CfnAlarm(
      this,
      "AgentUtilizationAlarmLow",
      {
        alarmDescription: "Scale-down if UnfinishedJobs == 0 for N minutes",
        metricName: "UnfinishedJobsCount",
        namespace: "Buildkite",
        statistic: "Maximum",
        period: scaleDownPeriod.value as any,
        evaluationPeriods: 1,
        threshold: 0,
        alarmActions: [agentScaleDownPolicy.ref],
        dimensions: [{ name: "Queue", value: buildkiteQueue.value as any }],
        comparisonOperator: "LessThanOrEqualToThreshold"
      }
    );
    agentUtilizationAlarmLow.cfnOptions.condition = useAutoscaling;

    const agentScaleUpPolicy = new autoscaling.CfnScalingPolicy(
      this,
      "AgentScaleUpPolicy",
      {
        adjustmentType: "ChangeInCapacity",
        autoScalingGroupName: agentAutoScaleGroup.ref,
        cooldown: "300",
        scalingAdjustment: scaleUpAdjustment.value as any
      }
    );
    agentScaleUpPolicy.cfnOptions.condition = useAutoscaling;

    const agentUtilizationAlarmHigh = new cloudwatch.CfnAlarm(
      this,
      "AgentUtilizationAlarmHigh",
      {
        alarmDescription: "Scale-up if ScheduledJobs > 0 for 1 minute",
        metricName: "ScheduledJobsCount",
        namespace: "Buildkite",
        statistic: "Minimum",
        period: 60,
        evaluationPeriods: 1,
        threshold: 0,
        alarmActions: [agentScaleUpPolicy.ref],
        dimensions: [{ name: "Queue", value: buildkiteQueue.value as any }],
        comparisonOperator: "GreaterThanThreshold"
      }
    );
    agentUtilizationAlarmHigh.cfnOptions.condition = useAutoscaling;

    const securityGroupSshIngress = new ec2.CfnSecurityGroupIngress(
      this,
      "SecurityGroupSshIngress",
      {
        groupId: securityGroup.attrGroupId,
        ipProtocol: "tcp",
        fromPort: 22,
        toPort: 22,
        cidrIp: "0.0.0.0/0"
      }
    );
    securityGroupSshIngress.cfnOptions.condition = enableSshIngress;

    const agentLifecycleTopic = new sns.CfnTopic(
      this,
      "AgentLifecycleTopic",
      {}
    );

    const agentLifecycleHookRole = new iam.CfnRole(
      this,
      "AgentLifecycleHookRole",
      {
        assumeRolePolicyDocument: {
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: ["autoscaling.amazonaws.com"] },
              Action: "sts:AssumeRole"
            }
          ]
        },
        policies: [
          {
            policyName: "AgentLifecyclePolicy",
            policyDocument: {
              Statement: [
                {
                  Effect: "Allow",
                  Action: ["sns:Publish"],
                  Resource: agentLifecycleTopic.ref
                }
              ]
            }
          }
        ],
        path: "/"
      }
    );

    const agentLifecycleHook = new autoscaling.CfnLifecycleHook(
      this,
      "AgentLifecycleHook",
      {
        autoScalingGroupName: agentAutoScaleGroup.ref,
        lifecycleTransition: "autoscaling:EC2_INSTANCE_TERMINATING",
        defaultResult: "CONTINUE",
        heartbeatTimeout: 120,
        notificationTargetArn: agentLifecycleTopic.ref,
        roleArn: agentLifecycleHookRole.attrArn
      }
    );

    const artifactsBucketPolicies = new iam.CfnPolicy(
      this,
      "ArtifactsBucketPolicies",
      {
        policyName: "ArtifactsBucketPolicy",
        policyDocument: {
          Statement: [
            {
              Effect: "Allow",
              Action: ["s3:Put*", "s3:List*", "s3:Get*"],
              Resource: [
                cdk.Fn.sub("arn:aws:s3:::${ArtifactsBucket}/*") as any,
                cdk.Fn.sub("arn:aws:s3:::${ArtifactsBucket}") as any
              ]
            }
          ]
        },
        roles: [iamRole.ref]
      }
    );
    artifactsBucketPolicies.cfnOptions.condition = useArtifactsBucket;

    const unmanagedSecretsBucketPolicy = new iam.CfnPolicy(
      this,
      "UnmanagedSecretsBucketPolicy",
      {
        policyName: "SecretsBucketPolicy",
        policyDocument: {
          Statement: [
            {
              Effect: "Allow",
              Action: ["s3:Get*", "s3:Get", "s3:List*"],
              Resource: [
                cdk.Fn.sub("arn:aws:s3:::${SecretsBucket}/*") as any,
                cdk.Fn.sub("arn:aws:s3:::${SecretsBucket}") as any
              ]
            }
          ]
        },
        roles: [iamRole.ref]
      }
    );
    unmanagedSecretsBucketPolicy.cfnOptions.condition = useSpecifiedSecretsBucket;

    const managedSecretsBucketPolicy = new iam.CfnPolicy(
      this,
      "ManagedSecretsBucketPolicy",
      {
        policyName: "SecretsBucketPolicy",
        policyDocument: {
          Statement: [
            {
              Effect: "Allow",
              Action: ["s3:Get*", "s3:Get", "s3:List*"],
              Resource: [
                cdk.Fn.sub("arn:aws:s3:::${ManagedSecretsBucket}/*") as any,
                cdk.Fn.sub("arn:aws:s3:::${ManagedSecretsBucket}") as any
              ]
            }
          ]
        },
        roles: [iamRole.ref]
      }
    );
    managedSecretsBucketPolicy.cfnOptions.condition = createSecretsBucket;

    const iamPolicies = new iam.CfnPolicy(this, "IAMPolicies", {
      policyName: "InstancePolicy",
      policyDocument: {
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "cloudwatch:PutMetricData",
              "cloudformation:DescribeStackResource",
              "ec2:DescribeTags",
              "autoscaling:DescribeAutoScalingInstances",
              "autoscaling:DescribeLifecycleHooks",
              "autoscaling:RecordLifecycleActionHeartbeat",
              "autoscaling:CompleteLifecycleAction",
              "autoscaling:SetInstanceHealth"
            ],
            Resource: "*"
          },
          {
            Effect: "Allow",
            Action: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
              "logs:DescribeLogStreams"
            ],
            Resource: "*"
          },
          {
            Effect: "Allow",
            Action: ["sqs:*", "sns:Unsubscribe", "sns:Subscribe"],
            Resource: "*"
          }
        ]
      },
      roles: [iamRole.ref]
    });

    const routes = new ec2.CfnRouteTable(this, "Routes", {
      vpcId: vpc.ref,
      tags: [{ key: "Name", value: cdk.Aws.STACK_NAME }]
    });
    routes.cfnOptions.condition = createVpcResources;

    const subnet1Routes = new ec2.CfnSubnetRouteTableAssociation(
      this,
      "Subnet1Routes",
      { subnetId: subnet1.ref, routeTableId: routes.ref }
    );
    subnet1Routes.cfnOptions.condition = createVpcResources;

    const subnet0Routes = new ec2.CfnSubnetRouteTableAssociation(
      this,
      "Subnet0Routes",
      { subnetId: subnet0.ref, routeTableId: routes.ref }
    );
    subnet0Routes.cfnOptions.condition = createVpcResources;

    const gateway = new ec2.CfnInternetGateway(this, "Gateway", {
      tags: [{ key: "Name", value: cdk.Aws.STACK_NAME }]
    });
    gateway.cfnOptions.condition = createVpcResources;

    const gatewayAttachment = new ec2.CfnVPCGatewayAttachment(
      this,
      "GatewayAttachment",
      { internetGatewayId: gateway.ref, vpcId: vpc.ref }
    );
    gatewayAttachment.cfnOptions.condition = createVpcResources;

    const routeDefault = new ec2.CfnRoute(this, "RouteDefault", {
      destinationCidrBlock: "0.0.0.0/0",
      gatewayId: gateway.ref,
      routeTableId: routes.ref
    });
    routeDefault.cfnOptions.condition = createVpcResources;
    routeDefault.addDependsOn(gatewayAttachment);

    new cdk.CfnOutput(this, "ManagedSecretsBucketOutput", {
      value: cdk.Fn.conditionIf(
        "CreateSecretsBucket",
        managedSecretsBucket.ref,
        ""
      ) as any
    });

    new cdk.CfnOutput(this, "ManagedSecretsLoggingBucketOutput", {
      value: cdk.Fn.conditionIf(
        "CreateSecretsBucket",
        managedSecretsLoggingBucket.ref,
        ""
      ) as any
    });

    new cdk.CfnOutput(this, "AutoScalingGroupNameOutput", {
      value: agentAutoScaleGroup.ref
    });

    new cdk.CfnOutput(this, "InstanceRoleNameOutput", { value: iamRole.ref });
  }
}
