/*!
 * engines/qrcode-local.js — vendored, dependency-free QR Code encoder/renderer.
 *
 * 20 Sept 2026 (Andy, live, three separate genuine attempts across three
 * different builds tonight -- 07:57, 08:39, 08:58 UTC -- each showing the
 * identical "QR renderer could not load" message even after the loadQr()
 * caching/isolation bugs earlier tonight were fixed and confirmed working):
 * the QR image step was the one part of this whole app that still depended
 * on reaching a third-party CDN (cdn.jsdelivr.net) LIVE, at the exact moment
 * a coach taps Generate, poolside, on whatever connection happens to be
 * available right then. Every other script and asset in this app is already
 * bundled same-origin and precached by sw.js at install time -- this file
 * closes that one remaining gap by replacing the CDN fetch with a real,
 * from-scratch QR encoder that ships as part of the app itself. No more live
 * third-party network request, ever, for the QR image to draw.
 *
 * Validated with an independent decoder (OpenCV's QRCodeDetector, plus a
 * from-scratch Reed-Solomon-syndrome re-check) round-tripping realistic
 * invite URLs (the exact 64-hex-char-token shape msos_create_swimmer_invite
 * produces) at the app's error-correction level (M) before this replaced
 * the CDN load -- see loadQr() in swimmer-invite-bn.js for the call site.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * McLay Swimming OS previously generated QR codes by loading a third-party
 * encoder live from a CDN (cdn.jsdelivr.net/npm/qrcodejs) at the moment a
 * coach tapped "Generate". That live network dependency has failed on real
 * devices poolside. This file implements the QR Code encoding algorithm
 * (ISO/IEC 18004) from scratch, in plain vanilla JS, so it can be bundled
 * and precached same-origin like every other script in the app and never
 * needs a live third-party request again.
 *
 * This is an ORIGINAL implementation of the public ISO/IEC 18004 standard
 * algorithm (mode selection, version selection, Reed-Solomon error
 * correction, module placement, data masking). It is not a copy of any
 * third-party library's source code; it implements the same publicly
 * documented standard that any conforming QR encoder must implement.
 *
 * WHAT IS SUPPORTED
 * ------------------
 *   - Byte mode encoding only (ISO/IEC 8859-1 / UTF-8 bytes). This is the
 *     safest general-purpose mode and is sufficient for this app's inputs
 *     (URLs such as https://.../swimmer-portal.html?invite=<token>).
 *     Numeric mode, Alphanumeric mode and Kanji mode are intentionally NOT
 *     implemented — they are optimizations that produce smaller codes for
 *     restricted character sets, not something this app needs.
 *   - Automatic version selection: the smallest QR version (1-40) that fits
 *     the given text at the requested error-correction level.
 *   - All four error-correction levels: L, M, Q, H (default: M).
 *   - Full module placement: finder patterns, separators, timing patterns,
 *     alignment patterns (versions 2-40), format information (BCH(15,5)),
 *     version information for versions >= 7 (BCH(18,6)).
 *   - All 8 standard data masks, scored with the four standard penalty
 *     rules; the lowest-penalty mask is chosen automatically.
 *   - Max practical input: whatever fits in a version-40 / level-L symbol
 *     in byte mode (2953 bytes). Realistic invite URLs in this app
 *     (60-150 chars) land around QR version 2-9.
 *
 * API (two layers, pick whichever is convenient)
 * ------------------------------------------------
 * 1) Drop-in replacement for the `qrcodejs` call site (minimal changes):
 *
 *      var qr = new QRCode(elementOrId, {
 *        text: "https://example.com/...",
 *        width: 256,
 *        height: 256,
 *        colorDark: "#000000",
 *        colorLight: "#ffffff",
 *        correctLevel: QRCode.CorrectLevel.M   // L=1, M=0, Q=3, H=2 (same
 *                                               // numeric values qrcodejs
 *                                               // used, so existing calls
 *                                               // like QRCode.CorrectLevel.M
 *                                               // keep working unchanged)
 *      });
 *      qr.makeCode("new text");  // re-render with new text
 *      qr.clear();               // empty the container
 *
 *    This draws a <canvas> into the given DOM element (by id string or
 *    element reference), matching the shape of the qrcodejs API it
 *    replaces.
 *
 * 2) Low-level, render-agnostic API (useful for canvas/SVG/testing):
 *
 *      var result = QRCode.encode("some text", QRCode.CorrectLevel.M);
 *      // result.moduleCount        -> integer, symbol size in modules
 *      // result.isDark(row, col)   -> boolean, true = dark/black module
 *      // result.version            -> integer 1-40, the chosen QR version
 *      // result.maskPattern        -> integer 0-7, the mask pattern used
 *
 *    Callers are responsible for adding a light "quiet zone" border
 *    (4 modules recommended by the spec) around the matrix when rendering
 *    to something a camera will scan from a distance.
 *
 * LOADING
 * -------
 * Works as a plain <script> tag in a browser (attaches `window.QRCode`,
 * only when `window.QRCode` is not already defined by something else) and
 * as a CommonJS module in Node (`module.exports = QRCode`) so it can be
 * unit tested directly with `require()`. No build step, no dependencies.
 */
(function (root, factory) {
  'use strict';
  var QRCode = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRCode;
  }
  if (root && !root.QRCode) {
    root.QRCode = QRCode;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this), function () {
  'use strict';

  // ===========================================================================
  // SECTION 1: Galois Field GF(256) arithmetic and Reed-Solomon error
  // correction. QR codes use the field defined by the primitive polynomial
  // x^8 + x^4 + x^3 + x^2 + 1 (0x11D), matching ISO/IEC 18004 Annex A.
  // ===========================================================================

  var GF_EXP = new Array(256);
  var GF_LOG = new Array(256);
  (function initGaloisField() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) {
        x ^= 0x11D;
      }
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
  }

  // Multiply two polynomials over GF(256). Coefficients are ordered highest
  // degree first, matching how the generator polynomial is built up below.
  function polyMultiply(p1, p2) {
    var result = new Array(p1.length + p2.length - 1);
    for (var i = 0; i < result.length; i++) result[i] = 0;
    for (var i = 0; i < p1.length; i++) {
      if (p1[i] === 0) continue;
      for (var j = 0; j < p2.length; j++) {
        result[i + j] ^= gfMul(p1[i], p2[j]);
      }
    }
    return result;
  }

  // Generator polynomial g(x) = (x - a^0)(x - a^1)...(x - a^(degree-1))
  function getGeneratorPoly(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      poly = polyMultiply(poly, [1, GF_EXP[i]]);
    }
    return poly;
  }

  // Reed-Solomon encode: given the data codewords for one block and the
  // number of error-correction codewords needed, returns the EC codewords
  // via polynomial long division in GF(256) (synthetic division, since the
  // generator polynomial is monic).
  function rsEncode(dataCodewords, ecCount) {
    var generator = getGeneratorPoly(ecCount);
    var result = dataCodewords.concat(new Array(ecCount).fill(0));
    for (var i = 0; i < dataCodewords.length; i++) {
      var coef = result[i];
      if (coef !== 0) {
        for (var j = 0; j < generator.length; j++) {
          result[i + j] ^= gfMul(generator[j], coef);
        }
      }
    }
    return result.slice(dataCodewords.length);
  }

  // ===========================================================================
  // SECTION 2: Error-correction-block table (ISO/IEC 18004 Table 9 /
  // Annex "Error Correction Characteristics"). For each version (1-40) and
  // level (L, M, Q, H, in that order) this gives one or two groups of
  // [blockCount, totalCodewordsPerBlock, dataCodewordsPerBlock]. This table
  // is a factual/structural property of the standard, not creative
  // expression - every conforming encoder must reproduce these exact
  // numbers. (Sanity-checked here: for every version, all four levels sum
  // to the same total codeword count, which is a hard invariant of the
  // spec and a strong signal the transcription below is correct.)
  // ===========================================================================

  var RS_BLOCK_TABLE = [
    /* 1  */ [[1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9]],
    /* 2  */ [[1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16]],
    /* 3  */ [[1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13]],
    /* 4  */ [[1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9]],
    /* 5  */ [[1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12]],
    /* 6  */ [[2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15]],
    /* 7  */ [[2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14]],
    /* 8  */ [[2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15]],
    /* 9  */ [[2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13]],
    /* 10 */ [[2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16]],
    /* 11 */ [[4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13]],
    /* 12 */ [[2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15]],
    /* 13 */ [[4, 133, 107], [8, 59, 37, 1, 60, 38], [8, 44, 20, 4, 45, 21], [12, 33, 11, 4, 34, 12]],
    /* 14 */ [[3, 145, 115, 1, 146, 116], [4, 64, 40, 5, 65, 41], [11, 36, 16, 5, 37, 17], [11, 36, 12, 5, 37, 13]],
    /* 15 */ [[5, 109, 87, 1, 110, 88], [5, 65, 41, 5, 66, 42], [5, 54, 24, 7, 55, 25], [11, 36, 12, 7, 37, 13]],
    /* 16 */ [[5, 122, 98, 1, 123, 99], [7, 73, 45, 3, 74, 46], [15, 43, 19, 2, 44, 20], [3, 45, 15, 13, 46, 16]],
    /* 17 */ [[1, 135, 107, 5, 136, 108], [10, 74, 46, 1, 75, 47], [1, 50, 22, 15, 51, 23], [2, 42, 14, 17, 43, 15]],
    /* 18 */ [[5, 150, 120, 1, 151, 121], [9, 69, 43, 4, 70, 44], [17, 50, 22, 1, 51, 23], [2, 42, 14, 19, 43, 15]],
    /* 19 */ [[3, 141, 113, 4, 142, 114], [3, 70, 44, 11, 71, 45], [17, 47, 21, 4, 48, 22], [9, 39, 13, 16, 40, 14]],
    /* 20 */ [[3, 135, 107, 5, 136, 108], [3, 67, 41, 13, 68, 42], [15, 54, 24, 5, 55, 25], [15, 43, 15, 10, 44, 16]],
    /* 21 */ [[4, 144, 116, 4, 145, 117], [17, 68, 42], [17, 50, 22, 6, 51, 23], [19, 46, 16, 6, 47, 17]],
    /* 22 */ [[2, 139, 111, 7, 140, 112], [17, 74, 46], [7, 54, 24, 16, 55, 25], [34, 37, 13]],
    /* 23 */ [[4, 151, 121, 5, 152, 122], [4, 75, 47, 14, 76, 48], [11, 54, 24, 14, 55, 25], [16, 45, 15, 14, 46, 16]],
    /* 24 */ [[6, 147, 117, 4, 148, 118], [6, 73, 45, 14, 74, 46], [11, 54, 24, 16, 55, 25], [30, 46, 16, 2, 47, 17]],
    /* 25 */ [[8, 132, 106, 4, 133, 107], [8, 75, 47, 13, 76, 48], [7, 54, 24, 22, 55, 25], [22, 45, 15, 13, 46, 16]],
    /* 26 */ [[10, 142, 114, 2, 143, 115], [19, 74, 46, 4, 75, 47], [28, 50, 22, 6, 51, 23], [33, 46, 16, 4, 47, 17]],
    /* 27 */ [[8, 152, 122, 4, 153, 123], [22, 73, 45, 3, 74, 46], [8, 53, 23, 26, 54, 24], [12, 45, 15, 28, 46, 16]],
    /* 28 */ [[3, 147, 117, 10, 148, 118], [3, 73, 45, 23, 74, 46], [4, 54, 24, 31, 55, 25], [11, 45, 15, 31, 46, 16]],
    /* 29 */ [[7, 146, 116, 7, 147, 117], [21, 73, 45, 7, 74, 46], [1, 53, 23, 37, 54, 24], [19, 45, 15, 26, 46, 16]],
    /* 30 */ [[5, 145, 115, 10, 146, 116], [19, 75, 47, 10, 76, 48], [15, 54, 24, 25, 55, 25], [23, 45, 15, 25, 46, 16]],
    /* 31 */ [[13, 145, 115, 3, 146, 116], [2, 74, 46, 29, 75, 47], [42, 54, 24, 1, 55, 25], [23, 45, 15, 28, 46, 16]],
    /* 32 */ [[17, 145, 115], [10, 74, 46, 23, 75, 47], [10, 54, 24, 35, 55, 25], [19, 45, 15, 35, 46, 16]],
    /* 33 */ [[17, 145, 115, 1, 146, 116], [14, 74, 46, 21, 75, 47], [29, 54, 24, 19, 55, 25], [11, 45, 15, 46, 46, 16]],
    /* 34 */ [[13, 145, 115, 6, 146, 116], [14, 74, 46, 23, 75, 47], [44, 54, 24, 7, 55, 25], [59, 46, 16, 1, 47, 17]],
    /* 35 */ [[12, 151, 121, 7, 152, 122], [12, 75, 47, 26, 76, 48], [39, 54, 24, 14, 55, 25], [22, 45, 15, 41, 46, 16]],
    /* 36 */ [[6, 151, 121, 14, 152, 122], [6, 75, 47, 34, 76, 48], [46, 54, 24, 10, 55, 25], [2, 45, 15, 64, 46, 16]],
    /* 37 */ [[17, 152, 122, 4, 153, 123], [29, 74, 46, 14, 75, 47], [49, 54, 24, 10, 55, 25], [24, 45, 15, 46, 46, 16]],
    /* 38 */ [[4, 152, 122, 18, 153, 123], [13, 74, 46, 32, 75, 47], [48, 54, 24, 14, 55, 25], [42, 45, 15, 32, 46, 16]],
    /* 39 */ [[20, 147, 117, 4, 148, 118], [40, 75, 47, 7, 76, 48], [43, 54, 24, 22, 55, 25], [10, 45, 15, 67, 46, 16]],
    /* 40 */ [[19, 148, 118, 6, 149, 119], [18, 75, 47, 31, 76, 48], [34, 54, 24, 34, 55, 25], [20, 45, 15, 61, 46, 16]]
  ];

  function getRSBlocks(version, levelIndex) {
    var rows = RS_BLOCK_TABLE[version - 1][levelIndex];
    var blocks = [];
    var groups = rows.length / 3;
    for (var g = 0; g < groups; g++) {
      var n = rows[g * 3];
      var total = rows[g * 3 + 1];
      var data = rows[g * 3 + 2];
      for (var k = 0; k < n; k++) {
        blocks.push({ totalCount: total, dataCount: data });
      }
    }
    return blocks;
  }

  function totalDataCodewords(version, levelIndex) {
    var blocks = getRSBlocks(version, levelIndex);
    var sum = 0;
    for (var i = 0; i < blocks.length; i++) sum += blocks[i].dataCount;
    return sum;
  }

  // ===========================================================================
  // SECTION 3: Error-correction level constants and byte-mode bit encoding.
  // ===========================================================================

  // Numeric values match the qrcodejs library this file replaces, so
  // existing call sites using QRCode.CorrectLevel.M etc. keep working.
  var CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };

  // Table-index order is [L, M, Q, H] (matches RS_BLOCK_TABLE row order).
  // Also happens to equal the numeric CorrectLevel values in that order,
  // which is exactly the 2-bit field used in format information (see
  // section 6), so the same array serves both purposes.
  var FORMAT_LEVEL_BITS = [1, 0, 3, 2];
  var LEVEL_VALUE_TO_INDEX = { 0: 1, 1: 0, 2: 3, 3: 2 }; // CorrectLevel value -> table index

  function charCountBits(version) {
    // Byte mode only: versions 1-9 use an 8-bit character count indicator,
    // versions 10-40 use 16 bits (ISO/IEC 18004 Table 3).
    return version <= 9 ? 8 : 16;
  }

  // UTF-8 encode a JS string into an array of byte values. Written by hand
  // (rather than relying on TextEncoder/Buffer) so this file behaves
  // identically in old browsers and in Node.
  function utf8Encode(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.codePointAt(i);
      if (code > 0xFFFF) i++; // consumed a surrogate pair
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
      } else if (code < 0x10000) {
        bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      } else {
        bytes.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      }
    }
    return bytes;
  }

  function BitBuffer() {
    this.buffer = [];
    this.length = 0;
  }
  BitBuffer.prototype.putBit = function (bit) {
    var bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    this.length++;
  };
  BitBuffer.prototype.put = function (num, length) {
    for (var i = length - 1; i >= 0; i--) {
      this.putBit(((num >>> i) & 1) === 1);
    }
  };

  // ===========================================================================
  // SECTION 4: Version (size) selection. Picks the smallest version whose
  // data capacity (in bits, at the requested EC level) can hold the mode
  // indicator + character count indicator + the data itself, byte mode only.
  // ===========================================================================

  function chooseVersion(byteLength, levelIndex) {
    for (var v = 1; v <= 40; v++) {
      var capacityBits = totalDataCodewords(v, levelIndex) * 8;
      var neededBits = 4 + charCountBits(v) + 8 * byteLength;
      if (neededBits <= capacityBits) return v;
    }
    return -1;
  }

  // ===========================================================================
  // SECTION 5: Alignment pattern coordinates. Rather than hand-transcribe
  // the 40-row coordinate table from the spec (error prone), this computes
  // the coordinates using the standard closed-form construction: the first
  // coordinate is always 6, the last is always (4*version + 10), and the
  // rest are evenly spaced (rounded to an even step), which is exactly how
  // the official table is generated. Verified against known values for
  // versions 2, 7, 14 and the version-32 special case below.
  // ===========================================================================

  function getAlignmentPositions(version) {
    if (version === 1) return [];
    var numAlign = Math.floor(version / 7) + 2;
    var size = version * 4 + 17;
    var step;
    if (version === 32) {
      step = 26; // the one documented exception to the regular step formula
    } else {
      step = Math.floor((version * 4 + numAlign * 2 + 1) / (numAlign * 2 - 2)) * 2;
    }
    var result = new Array(numAlign);
    result[0] = 6;
    var pos = size - 7;
    for (var i = numAlign - 1; i >= 1; i--) {
      result[i] = pos;
      pos -= step;
    }
    return result;
  }

  // ===========================================================================
  // SECTION 6: Format info (BCH(15,5)) and version info (BCH(18,6)).
  // ===========================================================================

  var G15 = 0x537;   // x^10+x^8+x^5+x^4+x^2+x+1
  var G15_MASK = 0x5412; // 101010000010010, XORed in per spec so the all-zero
                          // format (L, mask 0) never encodes as all-zero bits
  var G18 = 0x1F25;  // x^12+x^11+x^10+x^9+x^8+x^5+x^2+1

  function bitLength(x) {
    var l = 0;
    while (x !== 0) { x >>>= 1; l++; }
    return l;
  }

  function computeFormatBits(levelIndex, maskPattern) {
    var data = (FORMAT_LEVEL_BITS[levelIndex] << 3) | maskPattern;
    var d = data << 10;
    while (bitLength(d) - bitLength(G15) >= 0) {
      d ^= (G15 << (bitLength(d) - bitLength(G15)));
    }
    return ((data << 10) | d) ^ G15_MASK;
  }

  function computeVersionBits(version) {
    var d = version << 12;
    while (bitLength(d) - bitLength(G18) >= 0) {
      d ^= (G18 << (bitLength(d) - bitLength(G18)));
    }
    return (version << 12) | d;
  }

  // ===========================================================================
  // SECTION 7: Module placement — finder patterns, timing patterns,
  // alignment patterns, format/version info reservation, and the data
  // zig-zag placement with masking.
  // ===========================================================================

  function placeFinder(dark, reserved, size, row0, col0) {
    for (var r = -1; r <= 7; r++) {
      if (row0 + r <= -1 || size <= row0 + r) continue;
      for (var c = -1; c <= 7; c++) {
        if (col0 + c <= -1 || size <= col0 + c) continue;
        var isDarkModule =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        dark[row0 + r][col0 + c] = isDarkModule;
        reserved[row0 + r][col0 + c] = true;
      }
    }
  }

  function placeAlignment(dark, reserved, size, row0, col0) {
    for (var r = -2; r <= 2; r++) {
      for (var c = -2; c <= 2; c++) {
        var rr = row0 + r, cc = col0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        dark[rr][cc] = (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0));
        reserved[rr][cc] = true;
      }
    }
  }

  function reserveFormatInfo(reserved, size) {
    for (var i = 0; i < 15; i++) {
      var r = i < 6 ? i : (i < 8 ? i + 1 : size - 15 + i);
      reserved[r][8] = true;
      var c = i < 8 ? size - 1 - i : (i < 9 ? 15 - i : 14 - i);
      reserved[8][c] = true;
    }
  }

  function writeFormatInfo(dark, size, bits) {
    for (var i = 0; i < 15; i++) {
      var bit = ((bits >> i) & 1) === 1;
      var r = i < 6 ? i : (i < 8 ? i + 1 : size - 15 + i);
      dark[r][8] = bit;
      var c = i < 8 ? size - 1 - i : (i < 9 ? 15 - i : 14 - i);
      dark[8][c] = bit;
    }
  }

  function reserveVersionInfo(reserved, size) {
    for (var i = 0; i < 18; i++) {
      var r1 = Math.floor(i / 3), c1 = (i % 3) + size - 11;
      reserved[r1][c1] = true;
      var r2 = (i % 3) + size - 11, c2 = Math.floor(i / 3);
      reserved[r2][c2] = true;
    }
  }

  function writeVersionInfo(dark, size, bits) {
    for (var i = 0; i < 18; i++) {
      var bit = ((bits >> i) & 1) === 1;
      var r1 = Math.floor(i / 3), c1 = (i % 3) + size - 11;
      dark[r1][c1] = bit;
      var r2 = (i % 3) + size - 11, c2 = Math.floor(i / 3);
      dark[r2][c2] = bit;
    }
  }

  function buildSkeleton(version) {
    var size = version * 4 + 17;
    var dark = [];
    var reserved = [];
    for (var i = 0; i < size; i++) {
      dark.push(new Array(size).fill(false));
      reserved.push(new Array(size).fill(false));
    }

    // Three finder patterns (+ their separators, via the -1..7 loop bounds).
    placeFinder(dark, reserved, size, 0, 0);
    placeFinder(dark, reserved, size, 0, size - 7);
    placeFinder(dark, reserved, size, size - 7, 0);

    // Timing patterns: alternating dark/light along row 6 and column 6,
    // skipping cells already claimed by a finder pattern.
    for (var i = 8; i <= size - 9; i++) {
      if (!reserved[i][6]) { dark[i][6] = (i % 2 === 0); reserved[i][6] = true; }
      if (!reserved[6][i]) { dark[6][i] = (i % 2 === 0); reserved[6][i] = true; }
    }

    // Alignment patterns, skipping the three combinations that would
    // collide with a finder pattern's corner.
    var positions = getAlignmentPositions(version);
    if (positions.length > 0) {
      var first = positions[0], last = positions[positions.length - 1];
      for (var pi = 0; pi < positions.length; pi++) {
        for (var pj = 0; pj < positions.length; pj++) {
          var r = positions[pi], c = positions[pj];
          if ((r === first && c === first) || (r === first && c === last) || (r === last && c === first)) continue;
          placeAlignment(dark, reserved, size, r, c);
        }
      }
    }

    // The single fixed "dark module", always black, just left of the
    // bottom-left finder pattern.
    dark[size - 8][8] = true;
    reserved[size - 8][8] = true;

    // Reserve (but don't yet fill in) the format info area: its value
    // depends on which mask pattern gets chosen below. Per spec, reserved
    // areas are treated as light while the 8 candidate masks are scored.
    reserveFormatInfo(reserved, size);

    // Version info (versions 7+) doesn't depend on the mask, but per spec
    // is still treated as light during mask scoring, then filled in for
    // real afterwards — so just reserve it here too.
    if (version >= 7) {
      reserveVersionInfo(reserved, size);
    }

    return { size: size, dark: dark, reserved: reserved };
  }

  // Places the interleaved codeword bitstream into the matrix in the
  // standard boustrophedon (zig-zag) order: two-column strips from the
  // bottom-right, moving up then down alternately, skipping the vertical
  // timing column, applying `maskFn` to each data bit as it's placed.
  function placeData(dark, reserved, size, codewords, maskFn) {
    var inc = -1;
    var row = size - 1;
    var bitIndex = 7;
    var byteIndex = 0;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (var cc = 0; cc < 2; cc++) {
          var c = col - cc;
          if (!reserved[row][c]) {
            var bit = false;
            if (byteIndex < codewords.length) {
              bit = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
            }
            if (maskFn(row, c)) bit = !bit;
            dark[row][c] = bit;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || row >= size) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }

  // ===========================================================================
  // SECTION 8: Data masking — the 8 standard mask patterns and the 4
  // standard penalty rules (ISO/IEC 18004 section 8.8.2). Note: the exact
  // penalty numbers only affect which of the 8 *equally valid* masks gets
  // picked (readability/aesthetics), never whether the resulting code
  // decodes correctly — all 8 masks are legal QR symbols.
  // ===========================================================================

  var MASK_FUNCS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r, c) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return ((r * c) % 2 + (r * c) % 3) === 0; },
    function (r, c) { return (((r * c) % 2 + (r * c) % 3) % 2) === 0; },
    function (r, c) { return (((r + c) % 2 + (r * c) % 3) % 2) === 0; }
  ];

  var PATTERN_A = [true, false, true, true, true, false, true, false, false, false, false];
  var PATTERN_B = [false, false, false, false, true, false, true, true, true, false, true];

  function windowMatches(dark, r, c, dr, dc, pattern) {
    for (var k = 0; k < pattern.length; k++) {
      if (dark[r + dr * k][c + dc * k] !== pattern[k]) return false;
    }
    return true;
  }

  function computePenalty(dark, size) {
    var score = 0;

    // Rule 1: 5+ same-color modules in a row/column.
    for (var r = 0; r < size; r++) {
      var runLen = 1;
      for (var c = 1; c < size; c++) {
        if (dark[r][c] === dark[r][c - 1]) {
          runLen++;
        } else {
          if (runLen >= 5) score += 3 + (runLen - 5);
          runLen = 1;
        }
      }
      if (runLen >= 5) score += 3 + (runLen - 5);
    }
    for (var c = 0; c < size; c++) {
      var runLen2 = 1;
      for (var r = 1; r < size; r++) {
        if (dark[r][c] === dark[r - 1][c]) {
          runLen2++;
        } else {
          if (runLen2 >= 5) score += 3 + (runLen2 - 5);
          runLen2 = 1;
        }
      }
      if (runLen2 >= 5) score += 3 + (runLen2 - 5);
    }

    // Rule 2: 2x2 blocks of a single color.
    for (var r2 = 0; r2 < size - 1; r2++) {
      for (var c2 = 0; c2 < size - 1; c2++) {
        var v = dark[r2][c2];
        if (v === dark[r2][c2 + 1] && v === dark[r2 + 1][c2] && v === dark[r2 + 1][c2 + 1]) {
          score += 3;
        }
      }
    }

    // Rule 3: 1:1:3:1:1 finder-like pattern with a 4-module light run.
    for (var r3 = 0; r3 < size; r3++) {
      for (var c3 = 0; c3 <= size - 11; c3++) {
        if (windowMatches(dark, r3, c3, 0, 1, PATTERN_A) || windowMatches(dark, r3, c3, 0, 1, PATTERN_B)) score += 40;
      }
    }
    for (var c4 = 0; c4 < size; c4++) {
      for (var r4 = 0; r4 <= size - 11; r4++) {
        if (windowMatches(dark, r4, c4, 1, 0, PATTERN_A) || windowMatches(dark, r4, c4, 1, 0, PATTERN_B)) score += 40;
      }
    }

    // Rule 4: overall dark-module proportion far from 50%.
    var darkCount = 0;
    for (var r5 = 0; r5 < size; r5++) {
      for (var c5 = 0; c5 < size; c5++) {
        if (dark[r5][c5]) darkCount++;
      }
    }
    var percent = (darkCount * 100) / (size * size);
    var prevMultiple = Math.floor(percent / 5) * 5;
    var nextMultiple = prevMultiple + 5;
    score += Math.min(Math.abs(prevMultiple - 50), Math.abs(nextMultiple - 50)) / 5 * 10;

    return score;
  }

  // ===========================================================================
  // SECTION 9: Top-level encode(). Ties everything together: bit-stream
  // construction (mode + count + data + terminator + padding), Reed-Solomon
  // per block, codeword interleaving, module placement, mask selection.
  // ===========================================================================

  function encode(text, correctLevel) {
    if (correctLevel === undefined || correctLevel === null) correctLevel = CorrectLevel.M;
    var levelIndex = LEVEL_VALUE_TO_INDEX[correctLevel];
    if (levelIndex === undefined) throw new Error('QRCode: invalid correctLevel ' + correctLevel);

    var dataBytes = utf8Encode(String(text));
    var version = chooseVersion(dataBytes.length, levelIndex);
    if (version === -1) {
      throw new Error('QRCode: input text is too long to fit in a QR code (even at version 40) at this error-correction level.');
    }

    // --- Bit stream: mode indicator + character count + data ---
    var buf = new BitBuffer();
    buf.put(0x4, 4); // byte-mode indicator: 0100
    buf.put(dataBytes.length, charCountBits(version));
    for (var i = 0; i < dataBytes.length; i++) buf.put(dataBytes[i], 8);

    var totalDC = totalDataCodewords(version, levelIndex);
    var capacityBits = totalDC * 8;

    // Terminator: up to four 0 bits, only as many as fit.
    for (var t = 0; t < 4 && buf.length < capacityBits; t++) buf.putBit(false);
    // Pad with 0 bits to a byte boundary.
    while (buf.length % 8 !== 0) buf.putBit(false);
    // Pad with alternating 0xEC / 0x11 codewords until capacity is filled.
    var padToggle = 0;
    var padBytes = [0xEC, 0x11];
    while (buf.buffer.length < totalDC) {
      buf.put(padBytes[padToggle % 2], 8);
      padToggle++;
    }

    var dataCodewords = buf.buffer.slice(0, totalDC);

    // --- Split into RS blocks, compute EC codewords per block ---
    var rsBlocks = getRSBlocks(version, levelIndex);
    var offset = 0;
    var blocks = [];
    for (var b = 0; b < rsBlocks.length; b++) {
      var rb = rsBlocks[b];
      var d = dataCodewords.slice(offset, offset + rb.dataCount);
      offset += rb.dataCount;
      var ecCount = rb.totalCount - rb.dataCount;
      blocks.push({ data: d, ec: rsEncode(d, ecCount) });
    }

    // --- Interleave data codewords, then interleave EC codewords ---
    var maxDataLen = 0, maxEcLen = 0;
    for (var bi = 0; bi < blocks.length; bi++) {
      if (blocks[bi].data.length > maxDataLen) maxDataLen = blocks[bi].data.length;
      if (blocks[bi].ec.length > maxEcLen) maxEcLen = blocks[bi].ec.length;
    }
    var finalCodewords = [];
    for (var di = 0; di < maxDataLen; di++) {
      for (var bd = 0; bd < blocks.length; bd++) {
        if (di < blocks[bd].data.length) finalCodewords.push(blocks[bd].data[di]);
      }
    }
    for (var ei = 0; ei < maxEcLen; ei++) {
      for (var be = 0; be < blocks.length; be++) {
        if (ei < blocks[be].ec.length) finalCodewords.push(blocks[be].ec[ei]);
      }
    }

    // --- Build the module matrix skeleton, then try all 8 masks ---
    var skeleton = buildSkeleton(version);
    var best = null;
    for (var m = 0; m < 8; m++) {
      var trialDark = skeleton.dark.map(function (row) { return row.slice(); });
      placeData(trialDark, skeleton.reserved, skeleton.size, finalCodewords, MASK_FUNCS[m]);
      var penalty = computePenalty(trialDark, skeleton.size);
      if (best === null || penalty < best.penalty) {
        best = { penalty: penalty, mask: m, dark: trialDark };
      }
    }

    // --- Write the real format info (depends on chosen mask) and version info ---
    var formatBits = computeFormatBits(levelIndex, best.mask);
    writeFormatInfo(best.dark, skeleton.size, formatBits);
    if (version >= 7) {
      var versionBits = computeVersionBits(version);
      writeVersionInfo(best.dark, skeleton.size, versionBits);
    }

    var finalDark = best.dark;
    return {
      moduleCount: skeleton.size,
      version: version,
      maskPattern: best.mask,
      isDark: function (row, col) { return finalDark[row][col]; }
    };
  }

  // ===========================================================================
  // SECTION 10: Canvas-drawing constructor, matching the qrcodejs API shape
  // this file replaces, so the call site needs minimal changes.
  // ===========================================================================

  function QRCode(el, vOption) {
    this._htOption = {
      width: 256,
      height: 256,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: CorrectLevel.M,
      text: ''
    };
    if (typeof vOption === 'string') {
      this._htOption.text = vOption;
    } else if (vOption) {
      for (var k in vOption) {
        if (Object.prototype.hasOwnProperty.call(vOption, k)) this._htOption[k] = vOption[k];
      }
    }
    this._el = (typeof el === 'string')
      ? (typeof document !== 'undefined' ? document.getElementById(el) : null)
      : el;
    this._canvas = null;
    this._result = null;
    if (this._el) this._draw();
  }

  QRCode.prototype._draw = function () {
    if (typeof document === 'undefined' || !this._el) return;
    var el = this._el;
    while (el.firstChild) el.removeChild(el.firstChild);

    var result = encode(this._htOption.text, this._htOption.correctLevel);
    this._result = result;

    var w = this._htOption.width, h = this._htOption.height;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = this._htOption.colorLight;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = this._htOption.colorDark;

    var count = result.moduleCount;
    for (var r = 0; r < count; r++) {
      var y0 = Math.round((r * h) / count);
      var y1 = Math.round(((r + 1) * h) / count);
      for (var c = 0; c < count; c++) {
        if (!result.isDark(r, c)) continue;
        var x0 = Math.round((c * w) / count);
        var x1 = Math.round(((c + 1) * w) / count);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }

    this._canvas = canvas;
    el.appendChild(canvas);
  };

  QRCode.prototype.makeCode = function (text) {
    this._htOption.text = text;
    this._draw();
  };

  QRCode.prototype.clear = function () {
    if (this._el) {
      while (this._el.firstChild) this._el.removeChild(this._el.firstChild);
    }
    this._canvas = null;
    this._result = null;
  };

  QRCode.CorrectLevel = CorrectLevel;
  QRCode.encode = encode; // low-level API: encode(text, correctLevel) -> {moduleCount, isDark, version, maskPattern}

  return QRCode;
});
