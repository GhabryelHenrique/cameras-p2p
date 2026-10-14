# Estúdio P2P

Estúdio de live estilo StreamYard **sem backend**: seu PC é o estúdio. Os convidados entram por um link e
enviam a webcam **direto para você** (WebRTC P2P). Você escolhe quem está ao vivo, o layout, banners e logo.
Uma janela de **Saída** limpa (1920x1080) é capturada pelo OBS e transmitida no YouTube.

```
Convidado ──webcam/mic──▶ Seu PC (/studio) ──▶ canvas 1920x1080 + mix de áudio ──▶ janela Saída ──▶ OBS ──▶ YouTube
          ◀──programa + áudio (sem a própria voz)──┘
```

- **Sinalização:** broker público e gratuito do [PeerJS](https://peerjs.com), usado só para o "aperto de mão".
  Vídeo, áudio e chat vão direto entre os navegadores.
- **Nenhum servidor seu**: o site é estático e pode ser hospedado de graça.

## Rodar localmente

```bash
npm install
npm start          # http://localhost:4200
```

Para testar sozinho: abra o estúdio em uma janela e o link de convite numa janela anônima.

## Usando

1. **Home → Abrir meu estúdio.** Copie o **link de convite** no topo e mande aos amigos.
2. Quem entra cai nos **Bastidores**. Use **Adicionar à live** / **Remover da live** em cada card.
   - Microfone/câmera: muta o áudio ou oculta o vídeo **só no programa**. Estrela: destaca. *Pedir silêncio*: pede
     ao convidado para mutar. *Remover pessoa* (dois cliques): expulsa. Dê dois cliques no nome para renomear.
3. **Layouts:** Solo, Grade, Destaque e Lado a lado.
4. **Abas laterais**
   - **Chat:** conversa com os convidados. "Exibir na tela" transforma uma mensagem em banner.
   - **Banners:** crie textos e mostre um por vez. Também tem um letreiro rolante.
   - **Marca:** cor de destaque, cor/imagem de fundo, logo e texto de espera.
   - **Ajustes:** adicione sua câmera, compartilhe a tela, ligue o retorno de áudio, configure TURN e gere um novo link.
5. **Abrir janela de Saída** → leve para o OBS (abaixo).

## OBS → YouTube

1. Deixe a janela de **Saída** aberta. Ela pode ficar atrás de outras, mas **não minimize**.
   Mantenha também a aba do estúdio aberta, de preferência em uma janela própria.
2. OBS: **Fontes → + → Captura de janela** → `[chrome.exe]: Saída — Estúdio P2P`, método *Windows 10 (1903+)*.
3. Áudio:
   - **Simples:** **Fontes → + → Captura de áudio de aplicativo** na janela de Saída. Se o *retorno* (você ouvindo
     os convidados) estiver ligado, desligue-o ou use fones, para o áudio não duplicar.
   - **Recomendado:** instale o [VB-Cable](https://vb-audio.com/Cable/). Na janela de Saída, passe o mouse e escolha
     *Áudio do programa → CABLE Input*. No OBS, adicione **Captura de entrada de áudio → CABLE Output**.
     Assim você ouve os convidados nos fones e a live recebe só o programa.
4. **Configurações → Transmissão → YouTube**, conecte a conta e clique em **Iniciar transmissão**.

## Publicar o site (grátis, continua serverless)

Os convidados precisam abrir o site por **HTTPS**, porque o navegador só libera a câmera assim. O app usa hash
routing (`#/join/...`), então funciona em qualquer hospedagem estática sem configuração extra:

```bash
npx ng build --base-href ./
# publique a pasta dist/cameras-p2p/browser no GitHub Pages, Netlify ou Vercel
```

Netlify Drop é o caminho mais rápido: arraste a pasta `dist/cameras-p2p/browser` em https://app.netlify.com/drop.

## Limites e dicas

- **Upload do host:** cada convidado recebe o programa de volta (~1,2 Mbps). Com 4 a 6 convidados, uma conexão
  com 10 Mbps ou mais de upload resolve, já que o OBS também consome upload.
- **Redes restritas:** se alguém não conectar (rede corporativa, alguns 4G), crie um TURN gratuito
  (ex.: metered.ca), preencha em **Ajustes → Rede** e recarregue o estúdio.
- O ID do estúdio fica salvo no navegador, então o link de convite continua o mesmo entre sessões.
- Use fones de ouvido (host e convidados) para evitar eco.
- Navegador recomendado: Chrome ou Edge atualizados.

## Estrutura

```
src/app/core/
  studio.service.ts       estado do host: convidados, live/bastidores, layout, banners, chat
  compositor.service.ts   desenha a cena no <canvas> (layouts, nomes, banner, letreiro, logo)
  audio-mixer.service.ts  WebAudio: programa, mix-minus por convidado, retorno, limitador
  guest.service.ts        lado do convidado: câmera, conexão, comandos do host
  peer.util.ts            PeerJS + STUN/TURN
src/app/pages/
  home/  studio/  join/  output/
```
