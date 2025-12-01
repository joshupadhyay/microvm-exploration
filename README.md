# AWS Infrastructure with Pulumi

This project uses Pulumi to deploy AWS resources including an SQS queue and an EC2 instance.

## Prerequisites

1. **Install Pulumi**
   ```bash
   # macOS
   brew install pulumi/tap/pulumi

   # Or using curl
   curl -fsSL https://get.pulumi.com | sh
   ```

2. **Install Node.js and npm** (for TypeScript runtime)
   ```bash
   # macOS
   brew install node
   ```

3. **Configure AWS credentials**
   ```bash
   aws configure
   # Enter your AWS Access Key ID, Secret Access Key, and default region
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

## Configuration

Before deploying, you **must** update the placeholders in `Pulumi.dev.yaml`:

### Required Configuration

1. **AWS Region** - Set your preferred region
   ```yaml
   aws:region: us-east-1  # Change to your region
   ```

2. **AMI ID** - Find the Amazon Linux 2023 AMI for your region
   ```bash
   # Use AWS CLI to find the latest Amazon Linux 2023 AMI
   aws ec2 describe-images \
     --owners amazon \
     --filters "Name=name,Values=al2023-ami-2023*-x86_64" \
     --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
     --output text
   ```
   Then update:
   ```yaml
   microvm-exploration:amiId: ami-XXXXXXXXXXXXXXXXX  # Paste the AMI ID here
   ```

3. **EC2 Key Pair** - Create or use an existing key pair
   ```bash
   # Create a new key pair (optional)
   aws ec2 create-key-pair --key-name my-pulumi-key --query 'KeyMaterial' --output text > my-pulumi-key.pem
   chmod 400 my-pulumi-key.pem
   ```
   Then update:
   ```yaml
   microvm-exploration:keyName: YOUR-KEY-PAIR-NAME  # Your key pair name
   ```

### Optional Configuration

- **Instance Type**: Default is `t3.micro` (eligible for free tier)
- **VPC ID**: Uncomment and set if you want to use a specific VPC (otherwise uses default VPC)

## Project Structure

```
.
├── Pulumi.yaml          # Project configuration
├── Pulumi.dev.yaml      # Stack configuration (dev environment)
├── index.ts             # Infrastructure code
├── package.json         # Node.js dependencies
└── README.md            # This file
```

## Infrastructure Components

### SQS Queue
- **Name**: `microvm-queue`
- **Visibility Timeout**: 300 seconds
- **Message Retention**: 4 days
- **Long Polling**: Enabled (10 seconds)

### EC2 Instance
- **Security Group**: Allows SSH (port 22) and HTTP (port 80)
- **IAM Role**: Has permissions to access the SQS queue
- **User Data**: Stores the SQS queue URL in `/home/ec2-user/sqs_queue_url.txt`

## Deployment

1. **Login to Pulumi** (first time only)
   ```bash
   pulumi login
   ```
   This creates a free account at app.pulumi.com to store your state, or use `pulumi login --local` for local state.

2. **Install npm dependencies**
   ```bash
   npm install @pulumi/pulumi @pulumi/aws
   ```

3. **Preview the deployment**
   ```bash
   pulumi preview
   ```
   This will automatically detect the `dev` stack from `Pulumi.dev.yaml`.

4. **Deploy the infrastructure**
   ```bash
   pulumi up
   ```
   Review the changes and select "yes" to proceed. Pulumi will create all resources:
   - SQS queue
   - Security group
   - IAM role and instance profile
   - EC2 instance

5. **View outputs**
   ```bash
   pulumi stack output
   ```
   This shows:
   - `queueUrl` - SQS queue URL
   - `queueArn` - SQS queue ARN
   - `instanceId` - EC2 instance ID
   - `instancePublicIp` - Public IP address
   - `instancePublicDns` - Public DNS name
   - `securityGroupId` - Security group ID

## Accessing Your Resources

### Connect to EC2 Instance
```bash
# Get the public IP
INSTANCE_IP=$(pulumi stack output instancePublicIp)

# SSH into the instance
ssh -i /path/to/your-key.pem ec2-user@$INSTANCE_IP
```

### Access SQS Queue
```bash
# Get the queue URL
QUEUE_URL=$(pulumi stack output queueUrl)

# Send a test message
aws sqs send-message --queue-url $QUEUE_URL --message-body "Test message"

# Receive messages
aws sqs receive-message --queue-url $QUEUE_URL
```

## Customization

### Security Group Rules
Edit the `ingress` rules in `index.ts` to customize access:
```typescript
ingress: [
    {
        description: "SSH access",
        fromPort: 22,
        toPort: 22,
        protocol: "tcp",
        cidrBlocks: ["YOUR.IP.ADDRESS/32"], // Restrict to your IP
    },
    // Add more rules as needed
],
```

### User Data Script
Customize the EC2 startup script in `index.ts`:
```typescript
userData: pulumi.interpolate`#!/bin/bash
# Your initialization commands here
yum update -y
yum install -y docker
# etc.
`,
```

### SQS Queue Settings
Adjust queue parameters in `index.ts`:
```typescript
const queue = new aws.sqs.Queue("microvm-queue", {
    visibilityTimeoutSeconds: 300,  // Adjust as needed
    messageRetentionSeconds: 345600, // Adjust retention period
    // Add other SQS settings
});
```

## Cleanup

To destroy all resources:
```bash
pulumi destroy
```

## Troubleshooting

### Common Issues

1. **"No valid credential sources"**
   - Run `aws configure` to set up your AWS credentials

2. **"AMI not found"**
   - The AMI ID is region-specific. Make sure you're using an AMI from your selected region

3. **"KeyPair not found"**
   - Verify the key pair exists in your AWS region: `aws ec2 describe-key-pairs`

4. **Permission denied (SSH)**
   - Ensure your key file has correct permissions: `chmod 400 your-key.pem`

## Security Considerations

⚠️ **Important**: The default security group allows SSH from anywhere (0.0.0.0/0). For production use:
- Restrict SSH access to your IP address only
- Use a bastion host or AWS Systems Manager Session Manager
- Enable VPC flow logs
- Use AWS Secrets Manager for sensitive data

## Cost Estimates

- **EC2 t3.micro**: ~$0.0104/hour (~$7.50/month) - Free tier eligible
- **SQS**: First 1 million requests/month are free
- **Data Transfer**: Varies based on usage

Always check current AWS pricing for your region.

## Next Steps

- Set up CloudWatch alarms for monitoring
- Configure Auto Scaling for the EC2 instance
- Add DLQ (Dead Letter Queue) for SQS
- Implement proper secret management
- Set up CI/CD pipeline for deployments
