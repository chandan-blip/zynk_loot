# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  # Ubuntu 18.04 LTS base box
  config.vm.box = "ubuntu/bionic64"
  config.vm.hostname = "loot-dev"

  # Network configuration
  config.vm.network "forwarded_port", guest: 3000, host: 3000, host_ip: "127.0.0.1"  # Frontend
  config.vm.network "forwarded_port", guest: 5000, host: 5000, host_ip: "127.0.0.1"  # Backend API
  config.vm.network "forwarded_port", guest: 3305, host: 3305, host_ip: "127.0.0.1"  # phpMyAdmin
  config.vm.network "forwarded_port", guest: 3306, host: 3306, host_ip: "127.0.0.1"  # MySQL
  config.vm.network "forwarded_port", guest: 80, host: 8080, host_ip: "127.0.0.1"    # Production Nginx

  # Private network for internal communication
  config.vm.network "private_network", ip: "192.168.56.10"

  # VM Resources
  config.vm.provider "virtualbox" do |vb|
    vb.name = "loot-vm"
    vb.memory = "4096"
    vb.cpus = 2

    # Performance optimizations
    vb.customize ["modifyvm", :id, "--natdnshostresolver1", "on"]
    vb.customize ["modifyvm", :id, "--natdnsproxy1", "on"]
    vb.customize ["modifyvm", :id, "--ioapic", "on"]
  end

  # Sync the project folder
  config.vm.synced_folder ".", "/home/vagrant/loot",
    type: "virtualbox",
    mount_options: ["dmode=775,fmode=664"]

  # Provisioning script
  config.vm.provision "shell", inline: <<-SHELL
    set -e

    echo "=========================================="
    echo "  LOOT VM Provisioning"
    echo "=========================================="

    # Update system
    echo "[1/6] Updating system packages..."
    apt-get update -qq
    apt-get upgrade -y -qq

    # Install dependencies
    echo "[2/6] Installing dependencies..."
    apt-get install -y -qq \
      apt-transport-https \
      ca-certificates \
      curl \
      gnupg \
      lsb-release \
      git

    # Install Docker
    echo "[3/6] Installing Docker..."
    if ! command -v docker &> /dev/null; then
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    fi

    # Add vagrant user to docker group
    usermod -aG docker vagrant

    # Enable Docker service
    systemctl enable docker
    systemctl start docker

    # Install Node.js (for local development without Docker)
    echo "[4/6] Installing Node.js..."
    if ! command -v node &> /dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
      apt-get install -y nodejs
    fi

    # Create .env file if not exists
    echo "[5/6] Setting up environment..."
    cd /home/vagrant/loot
    if [ ! -f .env ]; then
      cp .env.example .env 2>/dev/null || cat > .env << 'EOF'
# Database Configuration
MYSQL_ROOT_PASSWORD=rootpassword
MYSQL_DATABASE=loot_db
MYSQL_USER=loot_user
MYSQL_PASSWORD=lootpassword

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Node Environment
NODE_ENV=development
EOF
    fi
    chown vagrant:vagrant .env

    # Make scripts executable
    chmod +x scripts/*.sh 2>/dev/null || true

    # Create convenience aliases
    echo "[6/6] Setting up aliases..."
    cat >> /home/vagrant/.bashrc << 'EOF'

# LOOT aliases
alias loot-dev='cd /home/vagrant/loot && docker compose -f docker-compose.dev.yml up --build'
alias loot-dev-d='cd /home/vagrant/loot && docker compose -f docker-compose.dev.yml up -d --build'
alias loot-prod='cd /home/vagrant/loot && docker compose -f docker-compose.prod.yml up -d --build'
alias loot-stop='cd /home/vagrant/loot && docker compose -f docker-compose.dev.yml down; docker compose -f docker-compose.prod.yml down'
alias loot-logs='docker compose -f /home/vagrant/loot/docker-compose.dev.yml logs -f'
alias loot-ps='docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'

# Go to project directory on login
cd /home/vagrant/loot
EOF

    echo ""
    echo "=========================================="
    echo "  LOOT VM Ready!"
    echo "=========================================="
    echo ""
    echo "  Access the VM:     vagrant ssh"
    echo ""
    echo "  Start development: loot-dev"
    echo "  Start background:  loot-dev-d"
    echo "  Start production:  loot-prod"
    echo "  Stop all:          loot-stop"
    echo "  View logs:         loot-logs"
    echo ""
    echo "  URLs (after starting):"
    echo "    Frontend:    http://localhost:3000"
    echo "    Admin:       http://localhost:3000/admin/login"
    echo "    API:         http://localhost:5000/api"
    echo "    phpMyAdmin:  http://localhost:3305"
    echo ""
    echo "  Admin credentials:"
    echo "    Email:    admin@loot.com"
    echo "    Password: admin123"
    echo ""
    echo "=========================================="
  SHELL

  # Run on every vagrant up (start containers if they exist)
  config.vm.provision "shell", run: "always", inline: <<-SHELL
    echo "Starting LOOT containers..."
    cd /home/vagrant/loot

    # Check if containers exist and start them
    if docker compose -f docker-compose.dev.yml ps -q 2>/dev/null | grep -q .; then
      docker compose -f docker-compose.dev.yml start
      echo "Development containers started!"
    else
      echo "Run 'loot-dev' or 'loot-dev-d' to start the application"
    fi
  SHELL
end
