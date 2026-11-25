export class AssetLoader {
  private images = new Map<string, HTMLImageElement>();
  private inflight = new Map<string, Promise<HTMLImageElement | null>>();

  public loadImage(url: string): Promise<HTMLImageElement | null> {
    const existing = this.images.get(url);
    if (existing) return Promise.resolve(existing);

    const pending = this.inflight.get(url);
    if (pending) return pending;

    if (typeof Image === 'undefined') return Promise.resolve(null);

    const p = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(url, img);
        this.inflight.delete(url);
        resolve(img);
      };
      img.onerror = () => {
        this.inflight.delete(url);
        resolve(null);
      };
      img.src = url;
    });

    this.inflight.set(url, p);
    return p;
  }

  public getImage(url: string): HTMLImageElement | undefined {
    return this.images.get(url);
  }

  public hasImage(url: string): boolean {
    return this.images.has(url);
  }

  public async preloadManifest(urls: readonly string[]): Promise<void> {
    await Promise.all(urls.map((u) => this.loadImage(u)));
  }

  public clear(): void {
    this.images.clear();
    this.inflight.clear();
  }
}

export const assetLoader = new AssetLoader();
