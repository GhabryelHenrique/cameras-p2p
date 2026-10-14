export function uid(len = 8): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export async function listDevices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cams: all.filter((d) => d.kind === 'videoinput' && d.deviceId),
    mics: all.filter((d) => d.kind === 'audioinput' && d.deviceId),
    outputs: all.filter((d) => d.kind === 'audiooutput' && d.deviceId),
  };
}

export function getCamera(camId?: string, micId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      ...(camId ? { deviceId: { exact: camId } } : {}),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: {
      ...(micId ? { deviceId: { exact: micId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

export function mediaErrorMessage(err: unknown): string {
  const name = (err as DOMException)?.name;
  if (name === 'NotAllowedError') return 'Permissão de câmera/microfone negada pelo navegador.';
  if (name === 'NotFoundError') return 'Nenhuma câmera ou microfone encontrado.';
  if (name === 'NotReadableError') return 'A câmera está em uso por outro aplicativo.';
  if (name === 'OverconstrainedError') return 'O dispositivo selecionado não está disponível.';
  return 'Não foi possível acessar câmera/microfone.';
}

/** Lê uma imagem e a reduz para caber em maxSize, retornando um data URL. */
export function readImage(file: File, maxSize: number, keepAlpha: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
