import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

/**
 * STACK CONFIGURATION
 */

// Load configuration
const config = new pulumi.Config();
const awsConfig = new pulumi.Config("aws");

// Get configuration values with placeholders
const region = awsConfig.require("region");
const instanceType =
  config.get("instanceType") || aws.ec2.InstanceType.T3_Micro;
const amiId = config.require("amiId"); // PLACEHOLDER: Set this in Pulumi.dev.yaml
const keyName = config.require("keyName"); // PLACEHOLDER: Your SSH key pair name
const vpcId = config.get("vpcId"); // PLACEHOLDER: Optional, uses default VPC if not set

// Create an SQS Queue
const queue = new aws.sqs.Queue("microvm-queue", {
  name: "microvm-queue",
  delaySeconds: 0,
  maxMessageSize: 262144, // 256 KB
  messageRetentionSeconds: 345600, // 4 days
  visibilityTimeoutSeconds: 300, // 5 minutes
  receiveWaitTimeSeconds: 10, // Enable long polling
  tags: {
    Name: "microvm-queue",
    Environment: pulumi.getStack(),
  },
});

// Create a Security Group for the EC2 instance
const securityGroup = new aws.ec2.SecurityGroup("microvm-sg", {
  description: "Security group for microvm EC2 instance",
  vpcId: vpcId, // Will use default VPC if not specified

  // PLACEHOLDER: Customize these rules based on your needs
  ingress: [
    {
      description: "SSH access",
      fromPort: 22,
      toPort: 22,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"], // PLACEHOLDER: Replace with your IP for better security
    },
    {
      description: "HTTP access",
      fromPort: 80,
      toPort: 80,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    {
      description: "Allow all outbound traffic",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: {
    Name: "microvm-sg",
    Environment: pulumi.getStack(),
  },
});

// Create an IAM role for the EC2 instance (optional, but recommended)
const ec2Role = new aws.iam.Role("microvm-ec2-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: {
          Service: "ec2.amazonaws.com",
        },
      },
    ],
  }),
  tags: {
    Name: "microvm-ec2-role",
    Environment: pulumi.getStack(),
  },
});

// Attach policy to allow EC2 to access SQS
const sqsPolicy = new aws.iam.RolePolicy("microvm-sqs-policy", {
  role: ec2Role.id,
  policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "sqs:SendMessage",
                "sqs:ReceiveMessage",
                "sqs:DeleteMessage",
                "sqs:GetQueueAttributes",
                "sqs:GetQueueUrl"
            ],
            "Resource": "${queue.arn}"
        }]
    }`,
});

// Create instance profile
const instanceProfile = new aws.iam.InstanceProfile(
  "microvm-instance-profile",
  {
    role: ec2Role.name,
  }
);

// Create the EC2 instance
const instance = new aws.ec2.Instance("microvm-instance", {
  ami: amiId,
  instanceType: instanceType,
  keyName: keyName,
  vpcSecurityGroupIds: [securityGroup.id],
  iamInstanceProfile: instanceProfile.name,

  // Root block device configuration
  rootBlockDevice: {
    volumeType: "gp3",
    volumeSize: 8, // 8 GB
    deleteOnTermination: true,
  },

  // PLACEHOLDER: Optional user data script to run on instance startup
  userData: pulumi.interpolate`#!/bin/bash
# Install basic dependencies
yum update -y
# PLACEHOLDER: Add your initialization commands here
# Example: Install AWS CLI, configure applications, etc.

# Store SQS queue URL in a file for easy access
echo "${queue.url}" > /home/ec2-user/sqs_queue_url.txt
`,

  monitoring: false, // Set to true for detailed CloudWatch monitoring (additional cost)

  tags: {
    Name: "microvm-instance",
    Environment: pulumi.getStack(),
  },
});

// Export outputs
export const queueUrl = queue.url;
export const queueArn = queue.arn;
export const instanceId = instance.id;
export const instancePublicIp = instance.publicIp;
export const instancePublicDns = instance.publicDns;
export const securityGroupId = securityGroup.id;
