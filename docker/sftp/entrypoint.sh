#!/bin/sh
# Installs the keys from /config (mounted read-only) with the permissions sshd
# insists on, makes sure the upload directory belongs to `uploader`, then runs
# sshd in the foreground.
set -eu

for file in host_ed25519_key client_ed25519.pub; do
  if [ ! -s "/config/$file" ]; then
    echo "missing /config/$file — run \`bun run sftp:setup\`" >&2
    exit 1
  fi
done

install -m 600 -o root -g root /config/host_ed25519_key /etc/ssh/ssh_host_ed25519_key
mkdir -p /etc/ssh/authorized_keys
install -m 644 -o root -g root /config/client_ed25519.pub /etc/ssh/authorized_keys/uploader

mkdir -p /data/uploads
chown uploader:uploader /data/uploads
chmod 700 /data/uploads

exec /usr/sbin/sshd -D -e
