# SFTP-only server for STORAGE_DRIVER=sftp (`bun run sftp:setup` builds and starts it).
#
# One account (`uploader`) that can only use SFTP — no shell, no forwarding —
# and only with the key in /config. The host key also comes from /config, so
# its fingerprint stays the same across rebuilds.
FROM ubuntu:24.04

# `usermod -p '*'`: no password, without the lock (`!`) that sshd refuses even
# for key sign-in.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-server \
 && rm -rf /var/lib/apt/lists/* /etc/ssh/ssh_host_* \
 && useradd --no-create-home --shell /usr/sbin/nologin uploader \
 && usermod -p '*' uploader \
 && mkdir -p /run/sshd

COPY sshd_config /etc/ssh/sshd_config
COPY entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
