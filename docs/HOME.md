# Rodar o Aldetes no seu PC (grátis, com Tailscale)

O servidor roda no seu computador (Linux ou Windows com WSL2). Você e seus amigos acessam pela rede privada do **Tailscale**, que é grátis, já vem com HTTPS e não exige abrir portas no roteador (funciona mesmo atrás de CGNAT).

Limitações: o chat só funciona com o PC ligado, e a janela do Ubuntu (WSL) precisa ficar aberta. Cada pessoa precisa instalar o Tailscale.

## 1. Pré-requisitos (dentro do Ubuntu/WSL)

```bash
sudo apt update && sudo apt install -y git curl openssl python3
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # depois feche e abra a janela do Ubuntu
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                  # abra o link que aparecer e faça login
```

No painel do Tailscale (https://login.tailscale.com/admin/dns), ative **MagicDNS** e **HTTPS Certificates**.

## 2. Baixar e subir

```bash
git clone https://github.com/<seu-usuario>/aldetes.git
cd aldetes
bash scripts/start-home.sh
```

O script gera os segredos (`.env.home`, não versionado), sobe tudo com Docker e publica:
- `https://<seu-pc>.<sua-rede>.ts.net` → web + API
- `wss://<seu-pc>.<sua-rede>.ts.net:8443` → sinalização do LiveKit (voz/vídeo)

A mídia WebRTC vai direto pelo IP do Tailscale (portas UDP 50000–50200).

## 3. Convidar amigos

1. Cada amigo instala o Tailscale (https://tailscale.com/download) e cria uma conta.
2. Em https://login.tailscale.com/admin/machines, clique nos `…` da máquina do Ubuntu → **Share…** e envie o convite para o e-mail do amigo.
3. Depois de aceitar o convite, o amigo abre `https://<seu-pc>.<sua-rede>.ts.net` no navegador (ou no app desktop, em "Alterar servidor").

## Comandos úteis

```bash
bash scripts/start-home.sh                                        # reiniciar/atualizar
docker compose -f infra/home/docker-compose.yml --env-file .env.home logs -f api livekit
docker compose -f infra/home/docker-compose.yml --env-file .env.home down   # parar (mantém os dados)
git pull && bash scripts/start-home.sh                            # atualizar o código
```
