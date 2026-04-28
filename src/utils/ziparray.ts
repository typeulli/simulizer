export function packF64Arrays(...arrays: Float64Array[]): ArrayBuffer {
    // header: [count, len1, len2, ...] padded to even length so byteLength is a multiple of 8
    const rawLen    = 1 + arrays.length;
    const paddedLen = rawLen % 2 === 0 ? rawLen : rawLen + 1;
    const header    = new Uint32Array(paddedLen);
    header[0] = arrays.length;

    arrays.forEach((arr, i) => {
        header[i + 1] = arr.length;
    });

    let totalBytes = header.byteLength;
    arrays.forEach(arr => totalBytes += arr.byteLength);

    const buffer = new ArrayBuffer(totalBytes);
    let offset = 0;

    // Header Copy
    new Uint32Array(buffer, offset, header.length).set(header);
    offset += header.byteLength;

    // Data Copy
    arrays.forEach(arr => {
        new Float64Array(buffer, offset, arr.length).set(arr);
        offset += arr.byteLength;
    });

    return buffer
}

export function unpackF64Arrays(buffer: ArrayBuffer): Float64Array[] {
    const count      = new Uint32Array(buffer, 0, 1)[0];
    const rawLen     = 1 + count;
    const paddedLen  = rawLen % 2 === 0 ? rawLen : rawLen + 1;
    const header     = new Uint32Array(buffer, 0, paddedLen);
    const arrays: Float64Array[] = [];
    let offset = paddedLen * Uint32Array.BYTES_PER_ELEMENT;

    for (let i = 0; i < count; i++) {
        const len = header[i + 1];
        arrays.push(new Float64Array(buffer, offset, len));
        offset += len * Float64Array.BYTES_PER_ELEMENT;
    }

    return arrays;
}