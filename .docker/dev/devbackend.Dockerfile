FROM python:3.11-slim

# Install bash and tools
RUN apt-get update && apt-get install -y \
    bash curl git nano && rm -rf /var/lib/apt/lists/*

# Add bash history config
RUN useradd -ms /bin/bash devuser && \
    mkdir -p /home/devuser/.cache && \
    touch /home/devuser/.bash_history && \
    chown -R devuser:devuser /home/devuser

USER devuser
WORKDIR /workspace

RUN echo '\
export HISTSIZE=1000\n\
export HISTFILESIZE=2000\n\
export HISTFILE=/home/devuser/.bash_history\n\
shopt -s histappend\n\
PROMPT_COMMAND="history -a; history -n; $PROMPT_COMMAND"\n\
' >> /home/devuser/.bashrc

# Install Python packages
COPY ./backend/requirements.txt .
RUN pip install --user -r requirements.txt

COPY . .

EXPOSE 8000

SHELL ["/bin/bash", "-c"]

CMD ["~/.local/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
