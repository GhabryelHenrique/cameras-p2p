export type SourceStatus = 'backstage' | 'live';
export type SourceKind = 'guest' | 'camera' | 'screen';
export type LayoutKind = 'solo' | 'grid' | 'spotlight' | 'sidebyside';

/** Uma fonte de vídeo do estúdio: convidado remoto, câmera do host ou tela compartilhada. */
export interface Source {
  id: string;
  kind: SourceKind;
  name: string;
  stream: MediaStream | null;
  status: SourceStatus;
  /** Momento em que entrou na live (define a ordem no layout). */
  liveSince: number;
  /** Estado informado pelo próprio convidado. */
  camOn: boolean;
  micOn: boolean;
  /** Mute aplicado pelo host somente no programa. */
  muteAudio: boolean;
  muteVideo: boolean;
}

export interface ChatMsg {
  id: string;
  from: string;
  text: string;
  ts: number;
  host?: boolean;
}

export interface Banner {
  id: string;
  text: string;
}

export interface Branding {
  accent: string;
  bgColor: string;
  bgImage: string | null;
  logo: string | null;
  showNames: boolean;
  idleText: string;
  ticker: string;
  tickerOn: boolean;
}

export const DEFAULT_BRANDING: Branding = {
  accent: '#e5484d',
  bgColor: '#101320',
  bgImage: null,
  logo: null,
  showNames: true,
  idleText: 'A live já vai começar…',
  ticker: '',
  tickerOn: false,
};

/** Mensagens convidado → host. `output` é a janela de Saída aberta no OBS: só recebe o programa. */
export type GuestMsg =
  | { t: 'hello'; name: string }
  | { t: 'output' }
  | { t: 'chat'; text: string }
  | { t: 'state'; camOn: boolean; micOn: boolean };

/** Mensagens host → convidado. */
export type HostMsg =
  | { t: 'welcome'; hostName: string }
  | { t: 'status'; status: SourceStatus }
  | { t: 'mute'; kind: 'audio' | 'video' }
  | { t: 'kick' }
  | { t: 'chat'; msg: ChatMsg }
  | { t: 'chat-history'; msgs: ChatMsg[] };
