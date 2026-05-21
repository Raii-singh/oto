# ─── OTOwire-Lite — AWS Infrastructure (Terraform) ───────────────────────────
# Deploys: VPC, EC2, RDS PostgreSQL, ElastiCache Redis,
#           ECR repos, ALB, Security Groups, CloudWatch dashboards
# Demonstrates: IaC, Cloud Networking, Managed Services, Observability

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "oto-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "ap-south-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# ─── Variables ────────────────────────────────────────────
variable "aws_region"       { default = "ap-south-1" }          # Mumbai — closest to India
variable "environment"      { default = "production" }
variable "omdb_api_key"     { sensitive = true }
variable "jwt_secret"       { sensitive = true }
variable "db_password"      { sensitive = true }
variable "project_name"     { default = "otowire" }

locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# ─── VPC ──────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = merge(local.common_tags, { Name = "oto-vpc" })
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
  tags   = merge(local.common_tags, { Name = "oto-igw" })
}

# Public subnets (ALB + EC2)
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = merge(local.common_tags, { Name = "oto-public-${count.index + 1}", Tier = "public" })
}

# Private subnets (RDS + Redis)
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = merge(local.common_tags, { Name = "oto-private-${count.index + 1}", Tier = "private" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
  tags = merge(local.common_tags, { Name = "oto-public-rt" })
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

data "aws_availability_zones" "available" { state = "available" }

# ─── Security Groups ──────────────────────────────────────
resource "aws_security_group" "alb" {
  name   = "oto-alb-sg"
  vpc_id = aws_vpc.main.id
  ingress { from_port = 80  to_port = 80  protocol = "tcp" cidr_blocks = ["0.0.0.0/0"] }
  ingress { from_port = 443 to_port = 443 protocol = "tcp" cidr_blocks = ["0.0.0.0/0"] }
  egress  { from_port = 0   to_port = 0   protocol = "-1"  cidr_blocks = ["0.0.0.0/0"] }
  tags   = merge(local.common_tags, { Name = "oto-alb-sg" })
}

resource "aws_security_group" "ec2" {
  name   = "oto-ec2-sg"
  vpc_id = aws_vpc.main.id
  ingress { from_port = 3000 to_port = 3003 protocol = "tcp" security_groups = [aws_security_group.alb.id] }
  ingress { from_port = 22   to_port = 22   protocol = "tcp" cidr_blocks = ["0.0.0.0/0"] description = "SSH" }
  egress  { from_port = 0    to_port = 0    protocol = "-1"  cidr_blocks = ["0.0.0.0/0"] }
  tags   = merge(local.common_tags, { Name = "oto-ec2-sg" })
}

resource "aws_security_group" "rds" {
  name   = "oto-rds-sg"
  vpc_id = aws_vpc.main.id
  ingress { from_port = 5432 to_port = 5432 protocol = "tcp" security_groups = [aws_security_group.ec2.id] }
  tags   = merge(local.common_tags, { Name = "oto-rds-sg" })
}

resource "aws_security_group" "redis" {
  name   = "oto-redis-sg"
  vpc_id = aws_vpc.main.id
  ingress { from_port = 6379 to_port = 6379 protocol = "tcp" security_groups = [aws_security_group.ec2.id] }
  tags   = merge(local.common_tags, { Name = "oto-redis-sg" })
}

# ─── ECR Repositories ─────────────────────────────────────
resource "aws_ecr_repository" "repos" {
  for_each             = toset(["content-service", "auth-service", "watchlist-service", "frontend"])
  name                 = "otowire/${each.key}"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = local.common_tags
}

# ─── RDS PostgreSQL ───────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name       = "oto-db-subnet"
  subnet_ids = aws_subnet.private[*].id
  tags       = local.common_tags
}

resource "aws_db_instance" "postgres" {
  identifier             = "oto-postgres"
  engine                 = "postgres"
  engine_version         = "15.4"
  instance_class         = "db.t3.micro"     # Free tier eligible
  allocated_storage      = 20
  db_name                = "otowire"
  username               = "oto"
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = false
  final_snapshot_id      = "oto-final-snapshot"
  backup_retention_period = 7
  multi_az               = false
  publicly_accessible    = false
  tags                   = merge(local.common_tags, { Name = "oto-postgres" })
}

# ─── ElastiCache Redis ────────────────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name       = "oto-redis-subnet"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "oto-redis"
  engine               = "redis"
  node_type            = "cache.t3.micro"    # Free tier eligible
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  engine_version       = "7.0"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  tags                 = merge(local.common_tags, { Name = "oto-redis" })
}

# ─── EC2 Instance ─────────────────────────────────────────
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]
  filter { name = "name" values = ["al2023-ami-*-x86_64"] }
}

resource "aws_key_pair" "deployer" {
  key_name   = "oto-deployer"
  public_key = file("~/.ssh/id_rsa.pub")
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = "t3.small"
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  key_name               = aws_key_pair.deployer.key_name
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    omdb_api_key        = var.omdb_api_key
    jwt_secret          = var.jwt_secret
    db_password         = var.db_password
    db_host             = aws_db_instance.postgres.address
    redis_host          = aws_elasticache_cluster.redis.cache_nodes[0].address
    aws_region          = var.aws_region
    ecr_registry        = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
  }))

  tags = merge(local.common_tags, { Name = "oto-app-server" })
}

data "aws_caller_identity" "current" {}

# IAM for EC2 to pull from ECR
resource "aws_iam_role" "ec2_role" {
  name = "oto-ec2-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "ecr_policy" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_policy" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "oto-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

# ─── Application Load Balancer ────────────────────────────
resource "aws_lb" "main" {
  name               = "oto-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  tags               = merge(local.common_tags, { Name = "oto-alb" })
}

resource "aws_lb_target_group" "frontend" {
  name     = "oto-frontend-tg"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id
  health_check { path = "/"; healthy_threshold = 2; unhealthy_threshold = 3 }
}

resource "aws_lb_target_group_attachment" "app" {
  target_group_arn = aws_lb_target_group.frontend.arn
  target_id        = aws_instance.app.id
  port             = 3000
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

# ─── CloudWatch Dashboard ─────────────────────────────────
resource "aws_cloudwatch_dashboard" "oto" {
  dashboard_name = "OTOwire-Lite"
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title  = "EC2 CPU Utilization"
          metrics = [["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.app.id]]
          period = 60, stat = "Average"
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "ALB Request Count"
          metrics = [["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix]]
          period = 60, stat = "Sum"
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title  = "RDS Connections"
          metrics = [["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", "oto-postgres"]]
          period = 60, stat = "Average"
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title  = "ElastiCache Hits vs Misses"
          metrics = [
            ["AWS/ElastiCache", "CacheHits",   "CacheClusterId", "oto-redis"],
            ["AWS/ElastiCache", "CacheMisses", "CacheClusterId", "oto-redis"]
          ]
          period = 60, stat = "Sum"
        }
      }
    ]
  })
}

# ─── Outputs ──────────────────────────────────────────────
output "alb_dns"        { value = aws_lb.main.dns_name }
output "ec2_public_ip"  { value = aws_instance.app.public_ip }
output "rds_endpoint"   { value = aws_db_instance.postgres.address }
output "redis_endpoint" { value = aws_elasticache_cluster.redis.cache_nodes[0].address }
output "ecr_urls" {
  value = { for k, v in aws_ecr_repository.repos : k => v.repository_url }
}
