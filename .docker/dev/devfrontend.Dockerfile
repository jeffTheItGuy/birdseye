FROM node:20

# Install bash and tools as root
RUN apt-get update && apt-get install -y \
    bash curl git nano && rm -rf /var/lib/apt/lists/*

# Create .bash_history and fix ownership as root
RUN touch /home/node/.bash_history && chown node:node /home/node/.bash_history

# Switch to node user
USER node
WORKDIR /workspace

# Set up bash history as node user
RUN echo '\
export HISTSIZE=1000\n\
export HISTFILESIZE=2000\n\
export HISTFILE=/home/node/.bash_history\n\
shopt -s histappend\n\
PROMPT_COMMAND="history -a; history -n; $PROMPT_COMMAND"\n\
' >> /home/node/.bashrc

EXPOSE 5173

SHELL ["/bin/bash", "-c"]

CMD ["npm", "run", "dev"]
