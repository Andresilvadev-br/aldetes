# Recursos que dependem de integrações externas, licenciamento ou suporte do sistema operacional

| Recurso | Dependência | Situação |
|---|---|---|
| Recuperação de senha por e-mail | Servidor SMTP (qualquer provedor ou servidor próprio) | Implementado. Sem SMTP, o link vai para o log da API (apenas em dev) |
| HTTPS / TLS | Domínio e Let's Encrypt (gratuito) | Automatizado via Caddy em `infra/prod` |
| Chamadas entre redes com NAT restritivo | Servidor TURN (o LiveKit tem TURN embutido) e domínio com certificado | Configurado. **Não testado em rede real** |
| Áudio do sistema ao compartilhar tela | **Windows:** Electron `loopback`. **Navegador Chromium:** aba (todos os SOs) ou tela inteira (Windows/ChromeOS). **macOS/Linux desktop:** não suportado de forma confiável pelo Electron atual | A UI só oferece onde funciona |
| Push-to-talk global | **macOS:** permissão "Monitoramento de entrada/Acessibilidade". **Linux Wayland:** hooks globais de teclado podem ser bloqueados pelo compositor (funciona em X11) | Implementado via libuiohook; se falhar, cai para PTT só com a janela em foco |
| Armazenamento seguro do token (desktop) | Keychain (macOS), DPAPI (Windows), libsecret/kwallet (Linux) | Sem keyring no Linux o token não é salvo (por segurança) |
| Instaladores sem aviso de segurança | Certificado de assinatura de código Windows (pago) e Apple Developer ID com notarização (pago) | Build configurado; assinatura depende de credenciais do proprietário |
| Atualização automática | Hospedagem estática dos artefatos (gratuita no próprio servidor) | `electron-updater` com provedor genérico; requer `ALDETES_UPDATE_URL` |
| Supressão de ruído avançada | Krisp (licença comercial, LiveKit Cloud) | **Não usada.** Alternativa livre planejada: RNNoise |
| Seletor de GIFs | Provedores como Tenor/Giphy exigem chave de API e termos | Não implementado (evitar dependência paga/externa) |
| Pré-visualização de links | Acesso de saída a sites de terceiros | Não implementado (planejado com proteção SSRF) |
| Apps móveis | Lojas Apple/Google (contas pagas) e permissões de background para VoIP (CallKit/ConnectionService) | Futuro |
