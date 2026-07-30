(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RecetteOcrEngine = api;
})(typeof window !== "undefined" ? window : globalThis, function(){
  "use strict";

  const ANALYSIS_MAX_SIDE = 1500;
  const MAX_TABLE_PIXELS = 5200000;

  function clamp(value, minimum, maximum){
    return Math.max(minimum, Math.min(maximum, value));
  }

  function createCanvas(width, height){
    if (typeof document === "undefined") throw new Error("canvas-unavailable");
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function copyCanvas(source, maxSide = Infinity){
    const sourceWidth = source.naturalWidth || source.width;
    const sourceHeight = source.naturalHeight || source.height;
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const canvas = createCanvas(sourceWidth * scale, sourceHeight * scale);
    const context = canvas.getContext("2d", { willReadFrequently:true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function cropCanvas(source, bounds){
    const x = clamp(Math.round(bounds.x), 0, source.width - 1);
    const y = clamp(Math.round(bounds.y), 0, source.height - 1);
    const width = clamp(Math.round(bounds.width), 1, source.width - x);
    const height = clamp(Math.round(bounds.height), 1, source.height - y);
    const canvas = createCanvas(width, height);
    canvas.getContext("2d", { willReadFrequently:true })
      .drawImage(source, x, y, width, height, 0, 0, width, height);
    return canvas;
  }

  function rotateCanvas(source, turns){
    const normalized = ((Number(turns) || 0) % 4 + 4) % 4;
    const sideways = normalized % 2 === 1;
    const canvas = createCanvas(sideways ? source.height : source.width, sideways ? source.width : source.height);
    const context = canvas.getContext("2d", { willReadFrequently:true });
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(normalized * Math.PI / 2);
    context.drawImage(source, -source.width / 2, -source.height / 2);
    return canvas;
  }

  function luma(red, green, blue){
    return red * .2126 + green * .7152 + blue * .0722;
  }

  function adaptiveBinaryFromCanvas(canvas){
    const context = canvas.getContext("2d", { willReadFrequently:true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height } = canvas;
    const gray = new Uint8Array(width * height);
    const saturation = new Uint8Array(width * height);
    const blueMask = new Uint8Array(width * height);
    for (let pixel = 0; pixel < gray.length; pixel++) {
      const offset = pixel * 4;
      const red = image.data[offset];
      const green = image.data[offset + 1];
      const blueValue = image.data[offset + 2];
      gray[pixel] = Math.round(luma(red, green, blueValue));
      saturation[pixel] = Math.max(red, green, blueValue) - Math.min(red, green, blueValue);
      blueMask[pixel] = blueValue > red + 12 && blueValue > green + 5 && saturation[pixel] > 28 ? 1 : 0;
    }

    const stride = width + 1;
    const integral = new Uint32Array((width + 1) * (height + 1));
    for (let y = 1; y <= height; y++) {
      let rowSum = 0;
      for (let x = 1; x <= width; x++) {
        rowSum += gray[(y - 1) * width + x - 1];
        integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
      }
    }

    const binary = new Uint8Array(width * height);
    const radius = Math.max(8, Math.round(Math.min(width, height) / 54));
    for (let y = 0; y < height; y++) {
      const top = Math.max(0, y - radius);
      const bottom = Math.min(height - 1, y + radius);
      for (let x = 0; x < width; x++) {
        const left = Math.max(0, x - radius);
        const right = Math.min(width - 1, x + radius);
        const sum = integral[(bottom + 1) * stride + right + 1] -
          integral[top * stride + right + 1] -
          integral[(bottom + 1) * stride + left] +
          integral[top * stride + left];
        const average = sum / ((right - left + 1) * (bottom - top + 1));
        const pixel = y * width + x;
        binary[pixel] = gray[pixel] < Math.min(176, average - 9) ? 1 : 0;
      }
    }
    return { width, height, data:binary, gray, saturation, blue:blueMask };
  }

  function rotateBinary(source, turns){
    let current = {
      width:source.width,
      height:source.height,
      data:new Uint8Array(source.data),
      gray:source.gray ? new Uint8Array(source.gray) : null,
      saturation:source.saturation ? new Uint8Array(source.saturation) : null,
      blue:source.blue ? new Uint8Array(source.blue) : null
    };
    const normalized = ((Number(turns) || 0) % 4 + 4) % 4;
    for (let turn = 0; turn < normalized; turn++) {
      const next = {
        width:current.height,
        height:current.width,
        data:new Uint8Array(current.width * current.height),
        gray:current.gray ? new Uint8Array(current.width * current.height) : null,
        saturation:current.saturation ? new Uint8Array(current.width * current.height) : null,
        blue:current.blue ? new Uint8Array(current.width * current.height) : null
      };
      for (let y = 0; y < current.height; y++) {
        for (let x = 0; x < current.width; x++) {
          const sourceIndex = y * current.width + x;
          const targetX = current.height - 1 - y;
          const targetY = x;
          const targetIndex = targetY * next.width + targetX;
          next.data[targetIndex] = current.data[sourceIndex];
          if (next.gray) next.gray[targetIndex] = current.gray[sourceIndex];
          if (next.saturation) next.saturation[targetIndex] = current.saturation[sourceIndex];
          if (next.blue) next.blue[targetIndex] = current.blue[sourceIndex];
        }
      }
      current = next;
    }
    return current;
  }

  function projections(binary){
    const xScores = new Uint32Array(binary.width);
    const yScores = new Uint32Array(binary.height);
    for (let y = 0; y < binary.height; y++) {
      for (let x = 0; x < binary.width; x++) {
        if (!binary.data[y * binary.width + x]) continue;
        xScores[x]++;
        yScores[y]++;
      }
    }
    return { xScores, yScores };
  }

  function clusterProjection(scores, threshold, maximumGap = 2){
    const clusters = [];
    let active = null;
    scores.forEach((score, position) => {
      if (score < threshold) {
        if (active && position - active.end > maximumGap) {
          clusters.push(active);
          active = null;
        }
        return;
      }
      if (!active || position - active.end > maximumGap) {
        if (active) clusters.push(active);
        active = { start:position, end:position, peak:score, peakPosition:position, weight:score, weightedPosition:position * score };
      } else {
        active.end = position;
        active.weight += score;
        active.weightedPosition += position * score;
        if (score > active.peak) {
          active.peak = score;
          active.peakPosition = position;
        }
      }
    });
    if (active) clusters.push(active);
    return clusters.map(cluster => ({
      start:cluster.start,
      end:cluster.end,
      peak:cluster.peak,
      position:Math.round(cluster.weightedPosition / Math.max(1, cluster.weight))
    }));
  }

  function projectionClusters(scores, relativeThreshold, absoluteThreshold){
    const maximum = scores.reduce((best, score) => Math.max(best, score), 0);
    const threshold = Math.max(absoluteThreshold, Math.round(maximum * relativeThreshold));
    return clusterProjection(scores, threshold);
  }

  function regionBandSignal(binary, bounds, atTop){
    const bandHeight = Math.max(4, Math.round(bounds.height * .045));
    const startY = atTop ? bounds.y : bounds.y + bounds.height - bandHeight;
    const endY = Math.min(binary.height, startY + bandHeight);
    const startX = clamp(Math.round(bounds.x), 0, binary.width - 1);
    const endX = clamp(Math.round(bounds.x + bounds.width), startX + 1, binary.width);
    let dark = 0;
    let saturated = 0;
    let blue = 0;
    let total = 0;
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const index = y * binary.width + x;
        dark += binary.data[index];
        if (binary.saturation && binary.saturation[index] > 38 && binary.gray[index] < 190) saturated++;
        if (binary.blue) blue += binary.blue[index];
        total++;
      }
    }
    return total ? dark / total + saturated / total * 1.2 + blue / total * 4.5 : 0;
  }

  function filterTableLineClusters(clusters, dimension, expectedMinimum, expectedMaximum){
    const plausible = clusters.filter(cluster => cluster.end - cluster.start <= dimension * .035);
    if (plausible.length >= expectedMinimum && plausible.length <= expectedMaximum) return plausible;
    return clusters.filter(cluster => cluster.end - cluster.start <= dimension * .05);
  }

  function detectBlueHeader(binary){
    if (!binary.blue) return null;
    const rowScores = new Uint32Array(binary.height);
    for (let y = 0; y < binary.height; y++) {
      let count = 0;
      for (let x = 0; x < binary.width; x++) count += binary.blue[y * binary.width + x];
      rowScores[y] = count;
    }
    const maximum = rowScores.reduce((best, score) => Math.max(best, score), 0);
    if (maximum < Math.max(12, binary.width * .04)) return null;
    const bands = clusterProjection(rowScores, Math.max(8, maximum * .28), 3);
    let best = null;
    bands.forEach(band => {
      let minimumX = binary.width;
      let maximumX = -1;
      let count = 0;
      for (let y = Math.max(0, band.start - 2); y <= Math.min(binary.height - 1, band.end + 2); y++) {
        for (let x = 0; x < binary.width; x++) {
          if (!binary.blue[y * binary.width + x]) continue;
          minimumX = Math.min(minimumX, x);
          maximumX = Math.max(maximumX, x);
          count++;
        }
      }
      const span = maximumX - minimumX;
      if (span < binary.width * .12 || span > binary.width * .9) return;
      const score = count + span * 5;
      if (!best || score > best.score) {
        best = {
          x:minimumX,
          y:Math.max(0, band.start - 4),
          width:span,
          height:Math.max(4, band.end - band.start + 9),
          score
        };
      }
    });
    return best;
  }

  function selectTableHorizontalRun(positions, blueHeader, dimension){
    const sorted = positions.slice().sort((left, right) => left - right);
    if (!blueHeader || sorted.length < 4) return sorted;

    const headerY = blueHeader.y + blueHeader.height * .25;
    let startIndex = 0;
    let startDistance = Infinity;
    sorted.forEach((position, index) => {
      const distance = Math.abs(position - headerY);
      if (distance < startDistance) {
        startIndex = index;
        startDistance = distance;
      }
    });

    const sequence = sorted.slice(startIndex);
    const sampleGaps = sequence.slice(1, 11)
      .map((position, index) => position - sequence[index])
      .filter(gap => gap >= 4 && gap <= dimension * .1);
    const typicalGap = median(sampleGaps);
    if (!typicalGap) return sorted;

    let endIndex = sequence.length;
    for (let index = 1; index < sequence.length; index++) {
      const gap = sequence[index] - sequence[index - 1];
      if (gap <= typicalGap * 1.8) continue;

      const nextGap = index + 1 < sequence.length
        ? sequence[index + 1] - sequence[index]
        : Infinity;
      const oneMissingLine = gap <= typicalGap * 2.6 &&
        nextGap >= typicalGap * .55 &&
        nextGap <= typicalGap * 1.55;
      if (oneMissingLine) continue;

      endIndex = index;
      break;
    }

    const selected = sequence.slice(0, endIndex);
    return selected.length >= 4 ? selected : sorted;
  }

  function analyzeBinary(binary){
    const { xScores, yScores } = projections(binary);
    const blueHeader = detectBlueHeader(binary);
    let vertical = projectionClusters(xScores, .24, Math.max(10, Math.round(binary.height * .025)));
    vertical = filterTableLineClusters(vertical, binary.width, 5, 12);
    if (vertical.length < 5) {
      vertical = projectionClusters(xScores, .16, Math.max(8, Math.round(binary.height * .018)));
      vertical = filterTableLineClusters(vertical, binary.width, 5, 16);
    }

    const verticalPositions = vertical.map(line => line.position).sort((a, b) => a - b);
    let xMin = blueHeader?.x ?? verticalPositions[0] ?? 0;
    let xMax = blueHeader ? blueHeader.x + blueHeader.width : verticalPositions[verticalPositions.length - 1] ?? binary.width - 1;
    if (xMax - xMin < binary.width * .12) {
      xMin = 0;
      xMax = binary.width - 1;
    }

    const restrictedYScores = new Uint32Array(binary.height);
    for (let y = 0; y < binary.height; y++) {
      let count = 0;
      for (let x = xMin; x <= xMax; x++) count += binary.data[y * binary.width + x];
      restrictedYScores[y] = count;
    }
    let horizontal = projectionClusters(restrictedYScores, .28, Math.max(10, Math.round((xMax - xMin) * .12)));
    horizontal = filterTableLineClusters(horizontal, binary.height, 4, 90);
    if (horizontal.length < 8) {
      horizontal = projectionClusters(restrictedYScores, .18, Math.max(8, Math.round((xMax - xMin) * .08)));
      horizontal = filterTableLineClusters(horizontal, binary.height, 4, 100);
    }

    const horizontalPositions = selectTableHorizontalRun(
      horizontal.map(line => line.position),
      blueHeader,
      binary.height
    );
    let yMin = blueHeader?.y ?? horizontalPositions[0] ?? 0;
    let yMax = horizontalPositions[horizontalPositions.length - 1] ?? binary.height - 1;
    if (yMax - yMin < binary.height * .16) {
      yMin = 0;
      yMax = binary.height - 1;
    }

    const bounds = { x:xMin, y:yMin, width:Math.max(1, xMax - xMin), height:Math.max(1, yMax - yMin) };
    const aspect = bounds.height / Math.max(1, bounds.width);
    const verticalInHeader = verticalPositions.filter(position => position >= xMin - bounds.width * .03 && position <= xMax + bounds.width * .03);
    const columnCount = blueHeader ? verticalInHeader.length : vertical.length;
    const columnScore = columnCount >= 5 && columnCount <= 8 ? 34 : Math.max(0, 20 - Math.abs(columnCount - 6) * 4);
    const rowScore = horizontalPositions.length >= 10
      ? Math.min(42, horizontalPositions.length * 1.2)
      : horizontalPositions.length * 1.4;
    const aspectScore = aspect >= 1.2 ? Math.min(28, 10 + aspect * 7) : -Math.min(35, (1.2 - aspect) * 40);
    const topSignal = regionBandSignal(binary, bounds, true);
    const bottomSignal = regionBandSignal(binary, bounds, false);
    const headerDelta = clamp((topSignal - bottomSignal) * 110, -26, 26);
    const areaRatio = bounds.width * bounds.height / Math.max(1, binary.width * binary.height);
    const areaScore = areaRatio >= .03 && areaRatio <= .9 ? 10 : -18;
    const score = columnScore + rowScore + aspectScore + headerDelta + areaScore;
    const confidence = clamp((score + 20) / 130, 0, 1);
    return {
      score,
      confidence,
      bounds,
      verticalLines:verticalPositions,
      horizontalLines:horizontalPositions,
      blueHeader,
      topSignal,
      bottomSignal,
      aspect,
      areaRatio
    };
  }

  function selectOrientation(binary, forcedTurns){
    if (Number.isInteger(forcedTurns)) {
      const turns = ((forcedTurns % 4) + 4) % 4;
      const rotated = rotateBinary(binary, turns);
      return { turns, binary:rotated, analysis:analyzeBinary(rotated), candidates:[] };
    }
    const candidates = [0, 1, 2, 3].map(turns => {
      const rotated = rotateBinary(binary, turns);
      return { turns, binary:rotated, analysis:analyzeBinary(rotated) };
    }).sort((left, right) => right.analysis.score - left.analysis.score);
    const best = candidates[0];
    return {
      turns:best.turns,
      binary:best.binary,
      analysis:best.analysis,
      candidates:candidates.map(candidate => ({
        turns:candidate.turns,
        score:Number(candidate.analysis.score.toFixed(2)),
        confidence:Number(candidate.analysis.confidence.toFixed(3)),
        verticalLines:candidate.analysis.verticalLines.length,
        horizontalLines:candidate.analysis.horizontalLines.length
      }))
    };
  }

  function fitLinear(points){
    if (!points.length) return { slope:0, intercept:0, residual:Infinity, coverage:0 };
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    let numerator = 0;
    let denominator = 0;
    points.forEach(point => {
      numerator += (point.x - meanX) * (point.y - meanY);
      denominator += (point.x - meanX) * (point.x - meanX);
    });
    const slope = denominator ? numerator / denominator : 0;
    const intercept = meanY - slope * meanX;
    const residual = points.reduce((sum, point) => sum + Math.abs(point.y - (slope * point.x + intercept)), 0) / points.length;
    return { slope, intercept, residual, coverage:points.length };
  }

  function robustFit(points, tolerance){
    const initial = fitLinear(points);
    const filtered = points.filter(point => Math.abs(point.y - (initial.slope * point.x + initial.intercept)) <= tolerance);
    return fitLinear(filtered.length >= Math.max(8, points.length * .35) ? filtered : points);
  }

  function verticalEdgePoints(binary, expectedX, yStart, yEnd, searchRadius){
    const points = [];
    const step = Math.max(1, Math.round((yEnd - yStart) / 420));
    for (let y = yStart; y <= yEnd; y += step) {
      let bestX = -1;
      let bestScore = 0;
      const minimumX = clamp(Math.round(expectedX - searchRadius), 0, binary.width - 1);
      const maximumX = clamp(Math.round(expectedX + searchRadius), minimumX, binary.width - 1);
      for (let x = minimumX; x <= maximumX; x++) {
        let score = 0;
        for (let offset = -3; offset <= 3; offset++) {
          const nextY = clamp(y + offset, 0, binary.height - 1);
          score += binary.data[nextY * binary.width + x];
        }
        if (score > bestScore || (score === bestScore && Math.abs(x - expectedX) < Math.abs(bestX - expectedX))) {
          bestScore = score;
          bestX = x;
        }
      }
      if (bestScore >= 4) points.push({ x:y, y:bestX });
    }
    return points;
  }

  function horizontalEdgePoints(binary, expectedY, xStart, xEnd, searchRadius){
    const points = [];
    const step = Math.max(1, Math.round((xEnd - xStart) / 420));
    for (let x = xStart; x <= xEnd; x += step) {
      let bestY = -1;
      let bestScore = 0;
      const minimumY = clamp(Math.round(expectedY - searchRadius), 0, binary.height - 1);
      const maximumY = clamp(Math.round(expectedY + searchRadius), minimumY, binary.height - 1);
      for (let y = minimumY; y <= maximumY; y++) {
        let score = 0;
        for (let offset = -3; offset <= 3; offset++) {
          const nextX = clamp(x + offset, 0, binary.width - 1);
          score += binary.data[y * binary.width + nextX];
        }
        if (score > bestScore || (score === bestScore && Math.abs(y - expectedY) < Math.abs(bestY - expectedY))) {
          bestScore = score;
          bestY = y;
        }
      }
      if (bestScore >= 4) points.push({ x, y:bestY });
    }
    return points;
  }

  function lineIntersection(vertical, horizontal){
    // Vertical fit stores x as a function of y. Horizontal fit stores y as a function of x.
    const denominator = 1 - vertical.slope * horizontal.slope;
    if (Math.abs(denominator) < .00001) return null;
    const x = (vertical.slope * horizontal.intercept + vertical.intercept) / denominator;
    return { x, y:horizontal.slope * x + horizontal.intercept };
  }

  function estimateCorners(binary, bounds){
    const searchX = Math.max(6, Math.round(bounds.width * .065));
    const searchY = Math.max(6, Math.round(bounds.height * .025));
    const left = robustFit(verticalEdgePoints(binary, bounds.x, bounds.y, bounds.y + bounds.height, searchX), searchX * .45);
    const right = robustFit(verticalEdgePoints(binary, bounds.x + bounds.width, bounds.y, bounds.y + bounds.height, searchX), searchX * .45);
    const top = robustFit(horizontalEdgePoints(binary, bounds.y, bounds.x, bounds.x + bounds.width, searchY), searchY * .45);
    const bottom = robustFit(horizontalEdgePoints(binary, bounds.y + bounds.height, bounds.x, bounds.x + bounds.width, searchY), searchY * .45);
    let corners = [
      lineIntersection(left, top),
      lineIntersection(right, top),
      lineIntersection(right, bottom),
      lineIntersection(left, bottom)
    ];
    const fallback = [
      { x:bounds.x, y:bounds.y },
      { x:bounds.x + bounds.width, y:bounds.y },
      { x:bounds.x + bounds.width, y:bounds.y + bounds.height },
      { x:bounds.x, y:bounds.y + bounds.height }
    ];
    const valid = corners.every(point => point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= bounds.x - searchX * 1.5 &&
      point.x <= bounds.x + bounds.width + searchX * 1.5 &&
      point.y >= bounds.y - searchY * 1.5 &&
      point.y <= bounds.y + bounds.height + searchY * 1.5);
    if (!valid) corners = fallback;
    const residual = [left.residual, right.residual, top.residual, bottom.residual].filter(Number.isFinite);
    const averageResidual = residual.length ? residual.reduce((sum, value) => sum + value, 0) / residual.length : Infinity;
    const confidence = valid ? clamp(1 - averageResidual / Math.max(8, searchX), .35, .98) : .3;
    return { corners, confidence, residual:averageResidual };
  }

  function pointDistance(first, second){
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function perspectiveDimensions(corners){
    const sourceWidth = Math.max(pointDistance(corners[0], corners[1]), pointDistance(corners[3], corners[2]));
    const sourceHeight = Math.max(pointDistance(corners[0], corners[3]), pointDistance(corners[1], corners[2]));
    const pixelScale = Math.min(1, Math.sqrt(MAX_TABLE_PIXELS / Math.max(1, sourceWidth * sourceHeight)));
    return {
      sourceWidth,
      sourceHeight,
      pixelScale,
      outputWidth:Math.max(80, Math.round(sourceWidth * pixelScale)),
      outputHeight:Math.max(120, Math.round(sourceHeight * pixelScale))
    };
  }

  function solveLinearSystem(matrix, values){
    const size = values.length;
    const augmented = matrix.map((row, index) => row.slice().concat(values[index]));
    for (let column = 0; column < size; column++) {
      let pivot = column;
      for (let row = column + 1; row < size; row++) {
        if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
      }
      if (Math.abs(augmented[pivot][column]) < 1e-9) throw new Error("perspective-singular");
      [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
      const divisor = augmented[column][column];
      for (let next = column; next <= size; next++) augmented[column][next] /= divisor;
      for (let row = 0; row < size; row++) {
        if (row === column) continue;
        const factor = augmented[row][column];
        for (let next = column; next <= size; next++) augmented[row][next] -= factor * augmented[column][next];
      }
    }
    return augmented.map(row => row[size]);
  }

  function perspectiveCoefficients(destination, source){
    const matrix = [];
    const values = [];
    for (let index = 0; index < 4; index++) {
      const x = destination[index].x;
      const y = destination[index].y;
      const u = source[index].x;
      const v = source[index].y;
      matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      values.push(u);
      matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      values.push(v);
    }
    return solveLinearSystem(matrix, values);
  }

  function warpPerspective(source, corners){
    const dimensions = perspectiveDimensions(corners);
    const width = dimensions.outputWidth;
    const height = dimensions.outputHeight;
    const scaledCorners = corners.map(point => ({ x:point.x, y:point.y }));
    const destination = [
      { x:0, y:0 },
      { x:width - 1, y:0 },
      { x:width - 1, y:height - 1 },
      { x:0, y:height - 1 }
    ];
    const coefficients = perspectiveCoefficients(destination, scaledCorners);
    const sourceContext = source.getContext("2d", { willReadFrequently:true });
    const sourceImage = sourceContext.getImageData(0, 0, source.width, source.height);
    const output = createCanvas(width, height);
    const outputContext = output.getContext("2d", { willReadFrequently:true });
    const outputImage = outputContext.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const denominator = coefficients[6] * x + coefficients[7] * y + 1;
        const sourceX = (coefficients[0] * x + coefficients[1] * y + coefficients[2]) / denominator;
        const sourceY = (coefficients[3] * x + coefficients[4] * y + coefficients[5]) / denominator;
        const outputOffset = (y * width + x) * 4;
        if (sourceX < 0 || sourceY < 0 || sourceX >= source.width - 1 || sourceY >= source.height - 1) {
          outputImage.data[outputOffset] = 255;
          outputImage.data[outputOffset + 1] = 255;
          outputImage.data[outputOffset + 2] = 255;
          outputImage.data[outputOffset + 3] = 255;
          continue;
        }
        const left = Math.floor(sourceX);
        const top = Math.floor(sourceY);
        const horizontal = sourceX - left;
        const vertical = sourceY - top;
        const indexes = [
          (top * source.width + left) * 4,
          (top * source.width + left + 1) * 4,
          ((top + 1) * source.width + left) * 4,
          ((top + 1) * source.width + left + 1) * 4
        ];
        for (let channel = 0; channel < 4; channel++) {
          const topValue = sourceImage.data[indexes[0] + channel] * (1 - horizontal) + sourceImage.data[indexes[1] + channel] * horizontal;
          const bottomValue = sourceImage.data[indexes[2] + channel] * (1 - horizontal) + sourceImage.data[indexes[3] + channel] * horizontal;
          outputImage.data[outputOffset + channel] = Math.round(topValue * (1 - vertical) + bottomValue * vertical);
        }
      }
    }
    outputContext.putImageData(outputImage, 0, 0);
    return output;
  }

  function median(values){
    const sorted = values.slice().sort((left, right) => left - right);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function repairBoundaries(lines, dimension){
    let unique = Array.from(new Set(lines.map(value => clamp(Math.round(value), 0, dimension - 1)))).sort((a, b) => a - b);
    if (unique.length < 2) return unique;
    let gaps = unique.slice(1).map((value, index) => value - unique[index]).filter(gap => gap >= 4);
    const initialTypical = median(gaps);
    if (initialTypical) {
      unique = unique.filter((value, index) => {
        if (!index || index === unique.length - 1) return true;
        const previousGap = value - unique[index - 1];
        const nextGap = unique[index + 1] - value;
        return previousGap >= initialTypical * .4 || previousGap + nextGap > initialTypical * 1.55;
      });
      gaps = unique.slice(1).map((value, index) => value - unique[index]).filter(gap => gap >= 4);
    }
    const typical = median(gaps.filter(gap => gap <= median(gaps) * 1.8)) || median(gaps);
    if (!typical) return unique;
    const repaired = [unique[0]];
    for (let index = 1; index < unique.length; index++) {
      const previous = repaired[repaired.length - 1];
      const gap = unique[index] - previous;
      if (gap > typical * 1.65) {
        const missing = Math.round(gap / typical) - 1;
        for (let insert = 1; insert <= missing; insert++) repaired.push(Math.round(previous + gap * insert / (missing + 1)));
      }
      repaired.push(unique[index]);
    }
    return repaired;
  }

  function chooseVerticalBoundaries(lines, scores, width){
    let candidates = lines.filter(position => position <= width * .06 || position >= width * .94 || scores[position] >= Math.max(10, scores.reduce((best, value) => Math.max(best, value), 0) * .42));
    candidates = Array.from(new Set(candidates)).sort((a, b) => a - b);
    if (candidates.length > 6) {
      const ranked = candidates.map(position => ({ position, score:scores[position] })).sort((left, right) => right.score - left.score).slice(0, 8);
      let best = [];
      let bestScore = -Infinity;
      const sizes = [6, 5];
      sizes.forEach(size => {
        function visit(start, selected){
          if (selected.length === size) {
            const ordered = selected.slice().sort((a, b) => a.position - b.position);
            const span = ordered[ordered.length - 1].position - ordered[0].position;
            const gaps = ordered.slice(1).map((item, index) => item.position - ordered[index].position);
            const minimumGap = Math.min(...gaps);
            const score = ordered.reduce((sum, item) => sum + item.score, 0) + span * .15 + minimumGap * .2;
            if (span >= width * .7 && minimumGap >= width * .07 && score > bestScore) {
              best = ordered.map(item => item.position);
              bestScore = score;
            }
            return;
          }
          for (let index = start; index <= ranked.length - (size - selected.length); index++) visit(index + 1, selected.concat(ranked[index]));
        }
        visit(0, []);
      });
      if (best.length) candidates = best;
    }
    return candidates;
  }

  function detectGrid(tableCanvas){
    const binary = adaptiveBinaryFromCanvas(tableCanvas);
    const { xScores, yScores } = projections(binary);
    const maximumX = xScores.reduce((best, score) => Math.max(best, score), 0);
    const maximumY = yScores.reduce((best, score) => Math.max(best, score), 0);
    let vertical = clusterProjection(xScores, Math.max(Math.round(tableCanvas.height * .26), maximumX * .42))
      .map(line => line.position);
    vertical = chooseVerticalBoundaries(vertical, xScores, tableCanvas.width);

    let horizontal = clusterProjection(yScores, Math.max(Math.round(tableCanvas.width * .34), maximumY * .48))
      .map(line => line.position);
    if (horizontal.length < 8) {
      horizontal = clusterProjection(yScores, Math.max(Math.round(tableCanvas.width * .22), maximumY * .32))
        .map(line => line.position);
    }
    horizontal = repairBoundaries(horizontal, tableCanvas.height);

    if (vertical[0] > tableCanvas.width * .06) vertical.unshift(0);
    if (vertical[vertical.length - 1] < tableCanvas.width * .94) vertical.push(tableCanvas.width - 1);
    if (horizontal[0] > tableCanvas.height * .035) horizontal.unshift(0);
    if (horizontal[horizontal.length - 1] < tableCanvas.height * .965) horizontal.push(tableCanvas.height - 1);
    vertical = Array.from(new Set(vertical.map(Math.round))).sort((a, b) => a - b);
    horizontal = Array.from(new Set(horizontal.map(Math.round))).sort((a, b) => a - b);

    const columnCount = vertical.length - 1;
    const dataRowCount = Math.max(0, horizontal.length - 2);
    const rowHeights = horizontal.slice(2).map((position, index) => position - horizontal[index + 1]);
    const rowMedian = median(rowHeights);
    const rowDeviation = rowHeights.length && rowMedian
      ? rowHeights.reduce((sum, value) => sum + Math.abs(value - rowMedian), 0) / rowHeights.length / rowMedian
      : 1;
    const plausibleColumns = columnCount === 4 || columnCount === 5;
    const plausibleRows = dataRowCount >= 2 && dataRowCount <= 60;
    const confidence = clamp(
      (plausibleColumns ? .45 : 0) +
      (plausibleRows ? .25 : 0) +
      Math.max(0, .2 - rowDeviation) +
      (horizontal.length >= 8 ? .1 : 0),
      0,
      1
    );
    return {
      binary,
      verticalLines:vertical,
      horizontalLines:horizontal,
      columnCount,
      dataRowCount,
      hasQuarter:columnCount === 5,
      truckColumn:columnCount === 5 ? 1 : 0,
      bucketColumns:columnCount === 5 ? [2, 3, 4] : [1, 2, 3],
      rowHeightMedian:rowMedian,
      rowHeightDeviation:rowDeviation,
      confidence,
      valid:plausibleColumns && plausibleRows && rowDeviation < .42
    };
  }

  function normalizedCorners(corners, width, height){
    return corners.map(point => ({ x:point.x / width, y:point.y / height }));
  }

  function denormalizedCorners(corners, width, height){
    return corners.map(point => ({ x:point.x * width, y:point.y * height }));
  }

  function prepare(source, options = {}){
    const analysisCanvas = copyCanvas(source, ANALYSIS_MAX_SIDE);
    const sourceBinary = adaptiveBinaryFromCanvas(analysisCanvas);
    const orientation = selectOrientation(sourceBinary, Number.isInteger(options.forcedTurns) ? options.forcedTurns : null);
    const rotatedAnalysisCanvas = rotateCanvas(analysisCanvas, orientation.turns);
    const rotatedSource = rotateCanvas(source, orientation.turns);
    const analysis = orientation.analysis;

    let cornerResult;
    if (Array.isArray(options.manualCorners) && options.manualCorners.length === 4) {
      const corners = denormalizedCorners(options.manualCorners, rotatedSource.width, rotatedSource.height);
      cornerResult = { corners, confidence:1, residual:0, manual:true };
    } else {
      const estimated = estimateCorners(orientation.binary, analysis.bounds);
      const analysisNormalized = normalizedCorners(estimated.corners, orientation.binary.width, orientation.binary.height);
      cornerResult = {
        corners:denormalizedCorners(analysisNormalized, rotatedSource.width, rotatedSource.height),
        confidence:estimated.confidence,
        residual:estimated.residual,
        manual:false
      };
    }

    let tableCanvas = null;
    let grid = null;
    let error = "";
    try {
      tableCanvas = warpPerspective(rotatedSource, cornerResult.corners);
      grid = detectGrid(tableCanvas);
      if (!grid.valid) error = "grid-weak";
    } catch(e) {
      error = "perspective-failed";
    }

    const sourceCornersNormalized = normalizedCorners(cornerResult.corners, rotatedSource.width, rotatedSource.height);
    const perspective = perspectiveDimensions(cornerResult.corners);
    const structureConfidence = clamp(
      cornerResult.manual
        ? analysis.confidence * .12 + cornerResult.confidence * .2 + (grid?.confidence || 0) * .68
        : analysis.confidence * .35 + cornerResult.confidence * .2 + (grid?.confidence || 0) * .45,
      0,
      1
    );
    const minimumStructureConfidence = cornerResult.manual ? .5 : .55;
    return {
      ok:Boolean(tableCanvas && grid?.valid && structureConfidence >= minimumStructureConfidence),
      error,
      turns:orientation.turns,
      rotatedSource,
      rotatedAnalysisCanvas,
      tableCanvas,
      grid,
      structureConfidence,
      debug:{
        originalDimensions:{ width:source.width, height:source.height },
        analysisDimensions:{ width:analysisCanvas.width, height:analysisCanvas.height },
        rotatedSourceDimensions:{ width:rotatedSource.width, height:rotatedSource.height },
        selectedRotation:orientation.turns * 90,
        orientationCandidates:orientation.candidates,
        tableBounds:analysis.bounds,
        perspectiveCorners:sourceCornersNormalized,
        perspectiveConfidence:cornerResult.confidence,
        perspectiveResidual:cornerResult.residual,
        manualCrop:Boolean(cornerResult.manual),
        croppedImageDimensions:{
          width:Math.round(perspective.sourceWidth),
          height:Math.round(perspective.sourceHeight)
        },
        perspectiveCorrectedDimensions:tableCanvas ? { width:tableCanvas.width, height:tableCanvas.height } : null,
        perspectiveOutputScale:Number(perspective.pixelScale.toFixed(4)),
        perspectiveWasDownscaled:perspective.pixelScale < .999,
        horizontalLines:grid?.horizontalLines || [],
        verticalLines:grid?.verticalLines || [],
        rowCount:grid?.dataRowCount || 0,
        columnCount:grid?.columnCount || 0,
        medianCellHeight:grid?.rowHeightMedian || 0,
        rowHeightDeviation:grid?.rowHeightDeviation || 0,
        gridConfidence:grid?.confidence || 0,
        structureConfidence,
        minimumStructureConfidence
      }
    };
  }

  function cellBounds(grid, rowIndex, columnIndex){
    const left = grid.verticalLines[columnIndex];
    const right = grid.verticalLines[columnIndex + 1];
    const top = grid.horizontalLines[rowIndex + 1];
    const bottom = grid.horizontalLines[rowIndex + 2];
    if (![left, right, top, bottom].every(Number.isFinite)) return null;
    const horizontalPadding = Math.max(2, Math.round((right - left) * .055));
    const verticalPadding = Math.max(2, Math.round((bottom - top) * .16));
    return {
      x:left + horizontalPadding,
      y:top + verticalPadding,
      width:Math.max(1, right - left - horizontalPadding * 2),
      height:Math.max(1, bottom - top - verticalPadding * 2)
    };
  }

  function enhanceCell(source, kind){
    const targetHeight = 104;
    const scale = clamp(targetHeight / Math.max(1, source.height), 1.5, 6);
    const canvas = createCanvas(Math.max(80, source.width * scale), Math.max(targetHeight, source.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently:true });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const binary = adaptiveBinaryFromCanvas(canvas);
    const output = context.createImageData(canvas.width, canvas.height);
    let darkPixels = 0;
    for (let pixel = 0; pixel < binary.data.length; pixel++) {
      const value = binary.data[pixel] ? 0 : 255;
      if (!value) darkPixels++;
      const offset = pixel * 4;
      output.data[offset] = value;
      output.data[offset + 1] = value;
      output.data[offset + 2] = value;
      output.data[offset + 3] = 255;
    }
    context.putImageData(output, 0, 0);
    return { canvas, inkRatio:darkPixels / Math.max(1, binary.data.length) };
  }

  function extractCell(tableCanvas, grid, rowIndex, columnIndex, kind){
    const bounds = cellBounds(grid, rowIndex, columnIndex);
    if (!bounds) return null;
    const rawCanvas = cropCanvas(tableCanvas, bounds);
    const enhanced = enhanceCell(rawCanvas, kind);
    return {
      rowIndex,
      columnIndex,
      kind,
      bounds,
      rawDimensions:{ width:rawCanvas.width, height:rawCanvas.height },
      enhancedDimensions:{ width:enhanced.canvas.width, height:enhanced.canvas.height },
      rawCanvas,
      canvas:enhanced.canvas,
      inkRatio:enhanced.inkRatio,
      blank:enhanced.inkRatio < .0045
    };
  }

  function buildCellDescriptors(grid){
    if (!grid?.valid) return [];
    const descriptors = [];
    for (let rowIndex = 0; rowIndex < grid.dataRowCount; rowIndex++) {
      grid.bucketColumns.forEach(columnIndex => {
        descriptors.push({ rowIndex, columnIndex, kind:"material" });
      });
    }
    return descriptors;
  }

  function buildCellPlan(prepared){
    if (!prepared?.tableCanvas || !prepared?.grid?.valid) return [];
    return buildCellDescriptors(prepared.grid).map(descriptor => (
      extractCell(
        prepared.tableCanvas,
        prepared.grid,
        descriptor.rowIndex,
        descriptor.columnIndex,
        descriptor.kind
      )
    )).filter(Boolean);
  }

  function drawGridOverlay(target, tableCanvas, grid){
    if (!target || !tableCanvas) return;
    target.width = tableCanvas.width;
    target.height = tableCanvas.height;
    const context = target.getContext("2d");
    context.drawImage(tableCanvas, 0, 0);
    if (!grid) return;
    context.save();
    context.lineWidth = Math.max(1, tableCanvas.width / 420);
    context.strokeStyle = "#ffcd23";
    grid.verticalLines.forEach(x => {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, tableCanvas.height);
      context.stroke();
    });
    context.strokeStyle = "#22a6f2";
    grid.horizontalLines.forEach(y => {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(tableCanvas.width, y);
      context.stroke();
    });
    context.restore();
  }

  function syntheticRecipeBinary(rowCount, turns){
    const columns = 5;
    const cellWidth = 24;
    const cellHeight = 10;
    const width = columns * cellWidth + 1;
    const height = (rowCount + 1) * cellHeight + 1;
    const data = new Uint8Array(width * height);
    for (let column = 0; column <= columns; column++) {
      const x = column * cellWidth;
      for (let y = 0; y < height; y++) data[y * width + x] = 1;
    }
    for (let row = 0; row <= rowCount + 1; row++) {
      const y = Math.min(height - 1, row * cellHeight);
      for (let x = 0; x < width; x++) data[y * width + x] = 1;
    }
    const gray = new Uint8Array(width * height).fill(245);
    const saturation = new Uint8Array(width * height);
    for (let y = 1; y < cellHeight; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x;
        gray[index] = 70;
        saturation[index] = 95;
      }
    }
    return rotateBinary({ width, height, data, gray, saturation }, turns || 0);
  }

  function syntheticRecipePageBinary(rowCount, turns){
    const columns = 5;
    const cellWidth = 24;
    const cellHeight = 10;
    const tableWidth = columns * cellWidth + 1;
    const tableHeight = (rowCount + 1) * cellHeight + 1;
    const offsetX = 30;
    const offsetY = 20;
    const width = tableWidth + 80;
    const height = tableHeight + 150;
    const data = new Uint8Array(width * height);
    const gray = new Uint8Array(width * height).fill(245);
    const saturation = new Uint8Array(width * height);
    const blue = new Uint8Array(width * height);

    for (let column = 0; column <= columns; column++) {
      const x = offsetX + column * cellWidth;
      for (let y = offsetY; y < offsetY + tableHeight; y++) data[y * width + x] = 1;
    }
    for (let row = 0; row <= rowCount + 1; row++) {
      const y = offsetY + Math.min(tableHeight - 1, row * cellHeight);
      for (let x = offsetX; x < offsetX + tableWidth; x++) data[y * width + x] = 1;
    }
    for (let y = offsetY + 1; y < offsetY + cellHeight; y++) {
      for (let x = offsetX + 1; x < offsetX + tableWidth - 1; x++) {
        const index = y * width + x;
        gray[index] = 65;
        saturation[index] = 100;
        blue[index] = 1;
      }
    }

    const pageBottom = height - 12;
    for (let x = 0; x < width; x++) data[pageBottom * width + x] = 1;
    return rotateBinary({ width, height, data, gray, saturation, blue }, turns || 0);
  }

  return {
    ANALYSIS_MAX_SIDE,
    copyCanvas,
    cropCanvas,
    rotateCanvas,
    adaptiveBinaryFromCanvas,
    rotateBinary,
    analyzeBinary,
    selectOrientation,
    estimateCorners,
    warpPerspective,
    detectGrid,
    prepare,
    cellBounds,
    extractCell,
    buildCellDescriptors,
    buildCellPlan,
    drawGridOverlay,
    syntheticRecipeBinary,
    syntheticRecipePageBinary
  };
});
