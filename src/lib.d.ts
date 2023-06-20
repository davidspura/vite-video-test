declare module "codem-isoboxer" {
  export interface Sample {
    data: Uint8Array;
    duration: number;
    renderingOffset: number;
    isSync: boolean;
    sample_size?: number;
    sample_flags?: number;
  }

  export class Box {
    type: string;
    size: number;
    data: Uint8Array;
    extendedType: string | null;
    boxes: Box[];
    data_offset?: number;
    samples?: Sample[];

    constructor(
      type: string,
      size: number,
      data: Uint8Array,
      extendedType?: string | null
    );
    static create(type: string, extendedType?: string | null): Box;

    parseBuffer(data: Uint8Array): void;
    parse(data: DataView): void;
    appendChild(box: Box): void;
    removeChild(box: Box): void;
    getBoxByType(type: string, start?: number): Box | null;
    getBoxesByType(type: string): Box[];
    getBoxAt(offset: number): Box | null;
    getBoxes(): Box[];
    getLength(): number;
    write(): Uint8Array;
    writeToFile(path: string): void;
    toArrayBuffer(): ArrayBuffer;
  }

  export class FileTypeBox extends Box {
    majorBrand: string;
    minorVersion: number;
    compatibleBrands: string[];
    boxes: Box[];

    constructor(type: string, size: number, data: Uint8Array);

    fetch(type: string): Box;

    fetchAll(type: string, returnEarly?: boolean): Box[];
  }

  export class MovieHeaderBox extends Box {
    timescale: number;
    duration: number;
    rate: number;
    volume: number;
    matrix: number[];
    nextTrackId: number;

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class TrackHeaderBox extends Box {
    flags: {
      enabled: boolean;
      inMovie: boolean;
      inPreview: boolean;
    };
    creationTime: Date;
    modificationTime: Date;
    trackId: number;
    duration: number;
    layer: number;
    alternateGroup: number;
    volume: number;
    matrix: number[];
    width: number;
    height: number;

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class SampleDescriptionBox extends Box {
    entries: (
      | AVCVisualSampleEntry
      | AudioSampleEntry
      | ElementaryStreamDescriptorBox
    )[];

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class BoxList extends Box {
    boxes: Box[];

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class TrackBox extends BoxList {
    header: TrackHeaderBox;
    media: MediaBox;

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class MediaHeaderBox extends Box {
    timescale: number;
    duration: number;

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class HandlerReferenceBox extends Box {
    handlerType: string;
    name: string;

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class MediaBox extends BoxList {
    header: MediaHeaderBox;
    handler: HandlerReferenceBox;
    information: MediaInformationBox;

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class MediaInformationBox extends BoxList {
    header: MediaHeaderBox;
    sampleTable: SampleTableBox;

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class SampleTableBox extends BoxList {
    sampleDescription: SampleDescriptionBox;
    timeToSample: TimeToSampleBox;
    compositionOffset?: CompositionOffsetBox;
    sampleToChunk: SampleToChunkBox;
    sampleSize: SampleSizeBox;
    chunkOffset: ChunkOffsetBox;

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class AVCVisualSampleEntry extends Box {
    constructor(type: string, size: number, data: Uint8Array);
  }

  export class AudioSampleEntry extends Box {
    constructor(type: string, size: number, data: Uint8Array);
  }

  export class ElementaryStreamDescriptorBox extends Box {
    constructor(type: string, size: number, data: Uint8Array);
  }

  export class TimeToSampleBox extends Box {
    entries: { sampleCount: number; sampleDelta: number }[];

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class CompositionOffsetBox extends Box {
    entries: { sampleCount: number; sampleOffset: number }[];

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class SampleToChunkBox extends Box {
    entries: {
      firstChunk: number;
      samplesPerChunk: number;
      sampleDescriptionIndex: number;
    }[];

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class SampleSizeBox extends Box {
    sampleSize: number;
    entries: number[];

    constructor(type: string, size: number, data: Uint8Array);
  }

  export class ChunkOffsetBox extends Box {
    entries: number[];

    constructor(type: string, size: number, data: Uint8Array);
  }

  export function parseBuffer(buffer: ArrayBufferLike): FileTypeBox;

  export function inspect(mp4Box: Box, depth?: number): string;
}
