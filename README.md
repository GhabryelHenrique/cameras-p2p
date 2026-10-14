# Estúdio P2P

Estúdio de live estilo StreamYard **sem backend**: seu PC é o estúdio. Os convidados entram por um link e
enviam a webcam **direto para você** (WebRTC P2P). Você escolhe quem está ao vivo, o layout, banners e logo.
A **Saída** limpa (1920x1080) entra no OBS como fonte Navegador e vai para o YouTube.

```
Convidado ──webcam/mic──▶ Seu PC (/studio) ──▶ canvas 1920x1080 + mix de áudio ──▶ Saída (/output/<id>) ──▶ OBS ──▶ YouTube
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
   - **Ajustes:** adicione sua câmera, compartilhe a tela, ligue o retorno de áudio, configure TURN, gere um novo link
     e copie o **link da Saída para o OBS**.
5. Leve a Saída para o OBS (abaixo).

## OBS → YouTube

### Recomendado: fonte Navegador

1. No estúdio, abra **Ajustes** e copie o **Link da Saída para o OBS** (`…/#/output/cp2p-…`).
2. OBS: **Fontes → + → Navegador**, cole o link, largura **1920**, altura **1080**.
3. Marque **Controlar áudio pelo OBS**. O áudio do programa (Opus estéreo, 256 kbps) entra direto no mixer do
   OBS, sem cabo virtual e sem misturar com o seu retorno.
4. **Configurações → Transmissão → YouTube**, conecte a conta e clique em **Iniciar transmissão**.

Mantenha a aba do estúdio aberta. A fonte do OBS recebe o programa por WebRTC (na mesma máquina, sem passar pela
internet) e **reconecta sozinha** se o estúdio for recarregado ou aberto depois do OBS. O link só muda se você
gerar um novo ID de estúdio.

> O `http://localhost:4200/#/output` **sem o ID** não funciona no OBS: a fonte Navegador roda num navegador
> separado, sem acesso à aba do estúdio. Ela precisa do ID para encontrar o estúdio.

### Alternativa: captura de janela

1. Clique em **Abrir janela de Saída** (topo do estúdio) e deixe-a aberta. Ela pode ficar atrás de outras, mas
   **não minimize**.
2. OBS: **Fontes → + → Captura de janela** → `[chrome.exe]: Saída — Estúdio P2P`, método *Windows 10 (1903+)*.
3. Áudio: **Fontes → + → Captura de áudio de aplicativo** na janela de Saída, ou mande o áudio para um
   [VB-Cable](https://vb-audio.com/Cable/) no seletor da própria janela (passe o mouse) e capture
   **CABLE Output** no OBS. Se o *retorno* estiver ligado, use fones para o áudio não duplicar.

## Publicar o site (grátis, continua serverless)

Os convidados precisam abrir o site por **HTTPS**, porque o navegador só libera a câmera assim. O app usa hash
routing (`#/join/...`), então funciona em qualquer hospedagem estática sem configuração extra:

```bash
npx ng build --base-href ./
# publique a pasta dist/cameras-p2p/browser no GitHub Pages, Netlify ou Vercel
```

Netlify Drop é o caminho mais rápido: arraste a pasta `dist/cameras-p2p/browser` em https://app.netlify.com/drop.

Este repositório já publica no GitHub Pages com domínio próprio (`cameras-p2p.ghabryelhenrique.com.br`):

```bash
npm run deploy   # ng deploy: build com base-href ./ + CNAME, push na branch gh-pages
```

Não passe `--base-href https://<usuário>.github.io/...`: com domínio próprio, o GitHub redireciona o `github.io`
para o domínio, e o navegador bloqueia os scripts (módulos) por CORS. O `CNAME` é gerado a cada deploy; sem ele,
o push substitui a branch e o domínio próprio cai. No GitHub, em **Settings → Pages**, marque
**Enforce HTTPS** para a câmera funcionar.

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
