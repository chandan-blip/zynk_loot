Updating your VPS
https://t.me/+YNMSbc_KGOA2YjA9

Deploy:
rsync -avz --exclude '
' --exclude '.git' --exclude '.env' /home/dev/Documents/loot/ root@89.117.58.200:/var/www/loot/

On VPS:
mysql -u loot_user -p'Zynk@dmin123!' loot_db < /var/www/loot/migration/sql/042-create-user-tracking.sql
cd /var/www/loot/backend && npm install && pm2 restart loot-backend
cd /var/www/loot/frontend && VITE_API_URL=/api npm run build

Frontend changes:  
 cd /var/www/loot/frontend 

# Copy updated files from local (run from your local machine)

rsync -avz --exclude 'node_modules' /home/dev/Documents/loot/frontend/ root@89.117.58.200:/var/www/loot/frontend/

# Then on VPS

npm install
VITE_API_URL=/api npm run build

Backend changes:

# Copy updated files from local machine

rsync -avz --exclude 'node_modules' /home/dev/Documents/loot/backend/ root@89.117.58.200:/var/www/loot/backend/

# Then on VPS

cd /var/www/loot/backend
npm install --omit=dev
pm2 restart loot-backend

Database migrations:

# Copy new migration file from local

scp /home/dev/Documents/loot/migration/sql/026-whatever.sql root@89.117.58.200:/var/www/loot/migration/sql/

# Run it on VPS

mysql -u loot_user -p'Zynk@dmin123!' loot_db < /var/www/loot/migration/sql/026-whatever.sql

Or sync everything at once from your local machine:
rsync -avz --exclude 'node_modules' --exclude '.vagrant' --exclude '.git' --exclude '.env' \
 /home/dev/Documents/loot/ root@89.117.58.200:/var/www/loot/

Then on VPS:
cd /var/www/loot/backend && npm install --omit=dev && pm2 restart loot-backend
cd /var/www/loot/frontend && npm install && VITE_API_URL=/api npm run build

No need to restart Nginx — it serves the built files directly.

Zynk@dmin123!

# Backend logs (PM2)

pm2 logs loot-backend

# Last 100 lines

pm2 logs loot-backend --lines 100

# Nginx access logs

tail -f /var/log/nginx/access.log

# Nginx error logs

tail -f /var/log/nginx/error.log

# MySQL logs

tail -f /var/log/mysql/error.log

pm2 logs will show real-time output (like the [CRON], [SEED] messages you saw earlier). Press Ctrl+C to stop watching.

Other useful PM2 commands:

pm2 status # check if backend is running
pm2 restart loot-backend # restart after code changes
pm2 monit # live CPU/memory monitor
