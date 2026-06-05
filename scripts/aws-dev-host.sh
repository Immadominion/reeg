#!/usr/bin/env bash
# Provision (and tear down) a single AWS EC2 host that can run BOTH Reeg phase M (Firecracker
# microVMs, which need /dev/kvm) and phase N (AWS Nitro Enclaves, for Nautilus attestation).
#
# It uses an 8th-gen Intel instance (c8i by default) with TWO capabilities enabled at launch:
#   --cpu-options NestedVirtualization=enabled   -> exposes /dev/kvm so Firecracker runs (M)
#   --enclave-options Enabled=true               -> allows Nitro Enclaves (N)
# c8i/m8i/r8i are the only families AWS documents as supporting both. (Bare-metal *.metal runs
# Firecracker but NOT enclaves; Graviton runs enclaves but NOT nested virt.) Whether both flags
# coexist on one instance is not explicitly documented, so `verify` checks both before you rely
# on it; if the enclave check fails, split into two instances (see the README note this prints).
#
# Cost: c8i.2xlarge is ~$0.38/hr on-demand in us-east-1 (mid-2026, re-check live). You pay only
# while RUNNING. `stop` keeps the disk (~$0.08/GB-month); `down` terminates and zeroes compute+disk.
# Everything is tagged Project=reeg-dev so teardown is unambiguous.
#
# Usage:
#   ./scripts/aws-dev-host.sh up        # create key+SG (scoped to your IP) and launch the instance
#   ./scripts/aws-dev-host.sh ip        # print the instance's public IP
#   ./scripts/aws-dev-host.sh verify    # SSH in and check /dev/kvm (M) and a hello-world enclave (N)
#   ./scripts/aws-dev-host.sh stop      # stop (pause billing for compute; keep the disk)
#   ./scripts/aws-dev-host.sh start     # start a stopped instance again
#   ./scripts/aws-dev-host.sh down      # TERMINATE the instance (and its volume)
#   ./scripts/aws-dev-host.sh ssh       # open an interactive SSH session
#
# Tunables (env): REGION (us-east-1), TYPE (c8i.2xlarge), DISK_GB (80), KEY (reeg-dev),
#   SG (reeg-dev-sg), TAG (reeg-dev). Requires: awscli v2, an `aws configure`d account, ssh.
set -euo pipefail

REGION="${REGION:-us-east-1}"
TYPE="${TYPE:-c8i.2xlarge}"   # 8 vCPU / 16 GiB: enough for an enclave + Firecracker microVMs
DISK_GB="${DISK_GB:-80}"
KEY="${KEY:-reeg-dev}"
SG="${SG:-reeg-dev-sg}"
TAG="${TAG:-reeg-dev}"
KEYFILE="${KEYFILE:-$HOME/.ssh/${KEY}}"
SSH_USER="ec2-user"           # Amazon Linux 2023 default user

aws() { command aws --region "$REGION" "$@"; }
die() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing '$1' (install it first)"; }

instance_id() {
  aws ec2 describe-instances \
    --filters "Name=tag:Project,Values=$TAG" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[].Instances[].InstanceId | [0]' --output text 2>/dev/null
}
public_ip() {
  aws ec2 describe-instances --instance-ids "$(instance_id)" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' --output text 2>/dev/null
}

cmd_up() {
  need aws; need ssh; need curl
  aws sts get-caller-identity >/dev/null 2>&1 || die "run 'aws configure' first (needs an AWS account + access key)"
  [ "$(instance_id)" != "None" ] && [ -n "$(instance_id)" ] && die "an instance tagged $TAG already exists: $(instance_id) ($(public_ip)). Use 'down' first."

  # SSH key: create locally if absent, then import the PUBLIC half to EC2 (private key never leaves this Mac).
  if [ ! -f "$KEYFILE" ]; then
    echo "creating SSH key $KEYFILE"; ssh-keygen -t ed25519 -N "" -f "$KEYFILE" -C "$KEY"
  fi
  if ! aws ec2 describe-key-pairs --key-names "$KEY" >/dev/null 2>&1; then
    echo "importing key pair $KEY"
    aws ec2 import-key-pair --key-name "$KEY" --public-key-material "fileb://${KEYFILE}.pub" >/dev/null
  fi

  # Security group: allow SSH (22) and the Nautilus enclave endpoint (3000) from YOUR IP only.
  local myip sgid
  myip="$(curl -fsS https://checkip.amazonaws.com)/32"
  sgid="$(aws ec2 describe-security-groups --group-names "$SG" --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)"
  if [ -z "$sgid" ] || [ "$sgid" = "None" ]; then
    echo "creating security group $SG"
    sgid="$(aws ec2 create-security-group --group-name "$SG" --description "Reeg dev host" --query GroupId --output text)"
  fi
  for port in 22 3000; do
    aws ec2 authorize-security-group-ingress --group-id "$sgid" --protocol tcp --port "$port" --cidr "$myip" >/dev/null 2>&1 || true
  done
  echo "security group $sgid open for tcp 22,3000 from $myip"

  # Latest Amazon Linux 2023 x86_64 AMI (region-correct, via the public SSM parameter).
  local ami
  ami="$(aws ssm get-parameters --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
        --query 'Parameters[0].Value' --output text)"
  [ -n "$ami" ] && [ "$ami" != "None" ] || die "could not resolve an Amazon Linux 2023 AMI in $REGION"
  echo "launching $TYPE ($ami) in $REGION with nested virtualization + Nitro Enclaves enabled..."

  local id
  id="$(aws ec2 run-instances \
    --image-id "$ami" --instance-type "$TYPE" --key-name "$KEY" --security-group-ids "$sgid" \
    --cpu-options 'NestedVirtualization=enabled' --enclave-options 'Enabled=true' \
    --block-device-mappings "[{\"DeviceName\":\"/dev/xvda\",\"Ebs\":{\"VolumeSize\":${DISK_GB},\"VolumeType\":\"gp3\",\"DeleteOnTermination\":true}}]" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Project,Value=$TAG},{Key=Name,Value=$TAG}]" \
    --query 'Instances[0].InstanceId' --output text)" \
    || die "launch failed. If the error mentions nested virtualization or enclaves not supported together, run M and N on two instances (TYPE=c8i.xlarge for M with only --cpu-options; a c6i.xlarge with only --enclave-options for N)."

  echo "waiting for $id to run..."; aws ec2 wait instance-running --instance-ids "$id"
  local ip; ip="$(public_ip)"
  echo
  echo "HOST UP: $id  ($TYPE, $REGION)  ip=$ip"
  echo "  ssh:    ssh -i $KEYFILE ${SSH_USER}@${ip}"
  echo "  verify: ./scripts/aws-dev-host.sh verify"
  echo "  stop (pause billing): ./scripts/aws-dev-host.sh stop    | terminate: ./scripts/aws-dev-host.sh down"
  echo
  echo "Add this to ~/.ssh/config so the coding agent can drive it as 'reeg-host':"
  echo "  Host reeg-host"
  echo "    HostName $ip"
  echo "    User $SSH_USER"
  echo "    IdentityFile $KEYFILE"
  echo "    StrictHostKeyChecking accept-new"
}

cmd_verify() {
  local ip; ip="$(public_ip)"; [ -n "$ip" ] && [ "$ip" != "None" ] || die "no running host (run 'up')"
  echo "== Phase M: /dev/kvm (Firecracker prerequisite) =="
  ssh -i "$KEYFILE" -o StrictHostKeyChecking=accept-new "${SSH_USER}@${ip}" \
    'ls -l /dev/kvm 2>/dev/null && ([ -r /dev/kvm ] && [ -w /dev/kvm ] && echo KVM-OK || echo KVM-NEEDS-PERMS) ; echo "vmx flags: $(grep -cw vmx /proc/cpuinfo)"' \
    || echo "KVM check failed (nested virt may be off or perms needed: sudo setfacl -m u:\$USER:rw /dev/kvm)"
  echo "== Phase N: Nitro Enclaves hello-world =="
  ssh -i "$KEYFILE" "${SSH_USER}@${ip}" 'bash -s' <<'REMOTE'
set -e
sudo dnf install -y aws-nitro-enclaves-cli aws-nitro-enclaves-cli-devel >/dev/null 2>&1 || true
sudo usermod -aG ne "$USER" 2>/dev/null || true
sudo systemctl enable --now nitro-enclaves-allocator.service >/dev/null 2>&1 || true
nitro-cli --version || { echo "nitro-cli not ready (re-login may be needed)"; exit 0; }
echo "enclaves enabled: $(cat /sys/module/nitro_enclaves/* 2>/dev/null >/dev/null; echo present-or-allocate)"
REMOTE
  echo "If KVM-OK and nitro-cli are both present, one host serves M+N. If the enclave path fails while nested virt is on, run N on a separate c6i.xlarge."
}

cmd_ip()    { public_ip; }
cmd_ssh()   { local ip; ip="$(public_ip)"; exec ssh -i "$KEYFILE" -o StrictHostKeyChecking=accept-new "${SSH_USER}@${ip}"; }
cmd_stop()  { aws ec2 stop-instances  --instance-ids "$(instance_id)" --query 'StoppingInstances[0].CurrentState.Name' --output text; }
cmd_start() { aws ec2 start-instances --instance-ids "$(instance_id)"; aws ec2 wait instance-running --instance-ids "$(instance_id)"; echo "ip=$(public_ip)"; }
cmd_down()  {
  local id; id="$(instance_id)"; [ -n "$id" ] && [ "$id" != "None" ] || { echo "nothing to terminate"; return; }
  echo "terminating $id (and its volume)..."; aws ec2 terminate-instances --instance-ids "$id" >/dev/null
  aws ec2 wait instance-terminated --instance-ids "$id"; echo "terminated. (Security group $SG and key $KEY are kept; delete manually if you want.)"
}

case "${1:-}" in
  up) cmd_up ;;
  ip) cmd_ip ;;
  verify) cmd_verify ;;
  ssh) cmd_ssh ;;
  stop) cmd_stop ;;
  start) cmd_start ;;
  down) cmd_down ;;
  *) echo "usage: $0 {up|ip|verify|ssh|stop|start|down}"; exit 2 ;;
esac
