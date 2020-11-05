// Sets the width of the rectangles
const RECT_WIDTH = 20
const data = {
  // Here's the input data for the chart:
  labels: ['May', 'June', 'July', 'August', 'Septembre', 'Octobre', 'Novembre'],
  thresholds: {
    min: 30,
    max: 100,
    excess: 125
  },
  series: [
    [
      { value: 120, meta: {} },
      { value: 150, meta: { expiries: 20, shipments: 40, } },
      { value: 50, meta: { expiries: 70, shipments: 30 } },
      { value: 100, meta: { expiries: 0, shipments: 60 } },
      { value: 70, meta: {} },
      { value: 55 , meta: { expiries: 10 } },
      { value: 40 }
    ]
  ]
}

// Draw a line with gaps
// ----------
// different "before events, after events" points
// It implements the Charts.Interpolation interface from here
// https://gionkunz.github.io/chartist-js/api-documentation.html#chartistinterpolation-method-none
// it's basically a variation of that function
function lineWithGaps(pathCoordinates, valueData) {
  var path = new Chartist.Svg.Path();
  var hole = true;

  let previousY
  let previousValue
  for(var i = 0; i < pathCoordinates.length; i += 2) {
    var currentX = pathCoordinates[i];
    var currentY = pathCoordinates[i + 1];
    var currentData = valueData[i / 2];

    const currentValue = Chartist.getMultiValue(currentData.value)

    // This was a hole, move to next point
    if (currentValue === undefined) {
      hole = true
      continue
    }

    // Data assumption: 1st point is in the past and will not include
    // expiries or shipments

    // Step 1. decide if we need to draw a gap to render
    // expiries / shipments in
    const shipments = _.get(currentData, 'meta.shipments', 0)
    const expiries = _.get(currentData, 'meta.expiries', 0)
    const eventsDiff = shipments - expiries

    // Step 2: Calculate the scaling factor between data and y-axis
    // would have liked to use axisY.projectValue for this like below, but it's not available here
    // apply on the difference from shipment/expiry events
    // a linear equation, like we did in school: y = kx + m
    let yFactor = 0
    if (previousY && previousValue) {
      yFactor = (currentY - previousY) / (currentValue - previousValue)
    }
    let yOffset = eventsDiff * yFactor

    // Step 3: This determines the size of the x-gap between the points
    // to fit the bars for expiries/shipments in between
    let xOffset = 0
    if (shipments) {
      xOffset += RECT_WIDTH
    }

    if (expiries) {
      xOffset += RECT_WIDTH
    }
    xOffset = xOffset / 2

    // Step 4: Set point meta data
    // If the first point drawn is a "currentValue before expiries and shipments" point
    // don't add any meta data
    // we add the meta data on the second point to control the tooltip
    const firstPointData = xOffset ? { value: {}} : currentData
    // Step 5: draw the points on the path
    if (hole) {
      // Don't pass data eve
      path.move(currentX - xOffset, currentY - yOffset, false, firstPointData)
    } else {
      path.line(currentX - xOffset, currentY - yOffset, false, firstPointData)
    }

    // if xOffset is non-zero, move to a 2nd point
    if (xOffset !== 0) {
      path.move(currentX + xOffset, currentY, false, currentData);
    }

    // Store the previous values to calculate for next point:
    previousY = currentY
    previousValue = currentValue

    hole = false;
  }

  return path;
}

// Draw the expiry/shipments bars as "points" in the chart
// ----------
// Uses the method from here:
// https://gionkunz.github.io/chartist-js/examples.html#example-line-modify-drawing
// to remove points that are not to be drawn
// and to replace the points where we draw events with black/red bars
function expiryShipmentBars (item) {
  if (item.type !== 'point') {
    return
  }

  const shipments = _.get(item, 'meta.shipments', 0)
  const expiries = _.get(item, 'meta.expiries', 0)

  if (shipments === 0 && expiries === 0) {
    item.element.remove()
    return
  }

  const stock = item.value.y
  const stockDiff = expiries - shipments
  const expiriesTop = stock + stockDiff
  const expiriesBottom = expiriesTop - expiries
  const shipmentsBottom = expiriesBottom
  const shipmentsTop = stock

  const baseY = item.axisY.chartRect.y1
  let expiryBar
  if (expiries !== 0) {
    // if there's shipments,
    // the expiry bar needs to be moved 2 "notches" left
    // to make space for shipments bar
    const expiryLeftSide = item.x - (shipments === 0 ? RECT_WIDTH : RECT_WIDTH * 2)
    const expiryRightSide = item.x - (shipments === 0 ? 0 : RECT_WIDTH)
    expiryBar = new Chartist.Svg('path', {
      d: [
        'M', expiryLeftSide, baseY - item.axisY.projectValue(expiriesTop),
        'L', expiryLeftSide, baseY - item.axisY.projectValue(expiriesBottom),
        'L', expiryRightSide, baseY - item.axisY.projectValue(expiriesBottom),
        'L', expiryRightSide, baseY - item.axisY.projectValue(expiriesTop),
        'z'
      ].join(' ')
    }, 'forecast-chart__expiries')

    item.element.parent().append(expiryBar)
  }

  let shipmentsBar
  if (shipments !== 0) {
    const shipmentsLeftSide = item.x - RECT_WIDTH
    const shipmentsRightSide = item.x
    shipmentsBar = new Chartist.Svg('path', {
      d: [
        'M', shipmentsLeftSide, baseY - item.axisY.projectValue(shipmentsTop),
        'L', shipmentsLeftSide, baseY - item.axisY.projectValue(shipmentsBottom),
        'L', shipmentsRightSide, baseY - item.axisY.projectValue(shipmentsBottom),
        'L', shipmentsRightSide, baseY - item.axisY.projectValue(shipmentsTop),
        'z'
      ].join(' ')
    }, 'forecast-chart__shipments')

    item.element.parent().append(shipmentsBar)
  }

  // Remove the point so it  does not get drawn
  item.element.remove()
}

// Draw Min/Max rectangles:
// ----------
function drawThresholds (chart) {
  // Use the chart bounding box for some baseline values
  const baseY = chart.axisY.chartRect.y1
  const xLeft = chart.axisY.chartRect.x1
  const xRight = chart.axisY.chartRect.x2

  // calculate Y values based on the y-axis
  const getY = (value) => {
    return baseY - chart.axisY.projectValue(value)
  }

  const thresholds = data.thresholds
  // Create the elements and append them to the grid SVG group
  minArea = new Chartist.Svg('path', {
    d: [
      'M', xLeft, getY(0),
      'L', xLeft, getY(thresholds.min),
      'L', xRight, getY(thresholds.min),
      'L', xRight, getY(0),
      'z'
    ].join(' ')
  }, 'forecast-chart__thresholds forecast-chart__thresholds--min')

  maxArea = new Chartist.Svg('path', {
    d: [
      'M', xLeft, getY(thresholds.max),
      'L', xLeft, getY(thresholds.excess),
      'L', xRight, getY(thresholds.excess),
      'L', xRight, getY(thresholds.max),
      'z'
    ].join(' ')
  }, 'forecast-chart__thresholds forecast-chart__thresholds--max')

  const gridGroup = chart.svg.querySelector('.ct-grids')
  gridGroup.append(minArea)
  gridGroup.append(maxArea)
}

// Instantiate the graph
// ----------
const chart = new Chartist.Line('#chart', data, {
  fullWidth: true,
  height: 400,
  // the points are used to place out expiry & shipment bars
  // they are not actually drawn:
  showPoint: true,
  showLine: true,
  axisY: {
    onlyInteger: true,
    offset: 20
  },
  // This adds our custom drawing function, that draws the line
  // with 2 points per month and a gap to make space for the bars
  lineSmooth: lineWithGaps,
  axisX: {
    position: 'end',
    offset: 20,
    labelOffset: {
      x: -30,
      y: 10
    }
  },
  axisY: {
    onlyInteger: true,
    referenceValue: 0
  },
  chartPadding: { left: 30, right: 20, top: 20, bottom: 20 },
  classNames: {
    line: 'forecast-chart__line'
  }
})

// Trigger the function to draw black/red bars
chart.on('draw', expiryShipmentBars)
chart.on('created', drawThresholds)
