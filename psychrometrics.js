const c8 = -1.0440397e4;
const c9 = -1.129465e1;
const c10 = -2.7022355e-2;
const c11 = 1.289036e-5;
const c12 = -2.4780681e-9;
const c13 = 6.5459673;

const maxPv = 0.7;
const minTemp = 32;
const maxTemp = 115;

// Saturation pressure in psi from temp in °F.
function satPressFromTempIp(temp) {
  var t = temp + 459.67;
  var lnOfSatPress =
    c8 / t +
    c9 +
    c10 * t +
    c11 * Math.pow(t, 2) +
    c12 * Math.pow(t, 3) +
    c13 * Math.log(t);
  var satPress = Math.exp(lnOfSatPress);
  return satPress;
}

var totalPressure = 14.696; //psia.

function satHumidRatioFromTempIp(temp) {
  var satPress = satPressFromTempIp(temp);
  return (0.621945 * satPress) / (totalPressure - satPress);
}

function wFromPv(pv) {
  return (0.621945 * pv) / (totalPressure - pv);
}

function pvFromw(w) {
  if (typeof w === "string") w = parseFloat(w);
  return totalPressure / (1 + 0.621945 / w);
}

// partial pressure of vapor from dry bulb temp (°F) and rh (0-1)
function pvFromTempRh(temp, rh) {
  return rh * satPressFromTempIp(temp);
}

function tempFromRhAndPv(rh, pv) {
  if (!rh || rh > 1) throw "RH value must be between 0-1";
  if (!pv || pv < 0 || pv > 2) throw "pv must be within sensible bounds (0-2)";

  psatMin = satPressFromTempIp(minTemp);
  psatMax = satPressFromTempIp(maxTemp);

  goalPsat = pv / rh;

  midTemp = (maxTemp + minTemp) / 2;
  psatMid = satPressFromTempIp(midTemp);

  updatedMaxTemp = maxTemp;
  updatedMinTemp = minTemp;

  iterations = 0;
  while (Math.abs(psatMid - goalPsat) > 0.00001) {
    if (iterations > 500) throw "Infinite loop in temp from Rh and Pv.";

    if (psatMid > goalPsat) {
      updatedMaxTemp = midTemp;
      midTemp = (updatedMinTemp + updatedMaxTemp) / 2;
      psatMid = satPressFromTempIp(midTemp);
      iterations++;
    } else {
      updatedMinTemp = midTemp;
      midTemp = (updatedMinTemp + updatedMaxTemp) / 2;
      psatMid = satPressFromTempIp(midTemp);
      iterations++;
    }
  }

  return midTemp;
}

function tempFromEnthalpyPv(h, pv) {
  ω = wFromPv(pv);
  return (h - ω * 1061) / (0.24 + ω * 0.445);
}

// Calculate derivative of pv vs. T
function dPvdT(rh, temp) {
  absTemp = temp + 459.67;
  term1 =
    -c8 / (absTemp * absTemp) +
    c10 +
    2 * c11 * absTemp +
    3 * c12 * absTemp * absTemp +
    c13 / absTemp;
  return rh * satPressFromTempIp(temp) * term1;
}

tempAtCutoff = tempFromRhAndPv(1, maxPv);

temps = [];
for (i = minTemp; i <= maxTemp; i = i + 0.5) {
  temps.push(i);
}
temps.push(tempAtCutoff);
temps = temps.sort(function(a, b) {
  return a - b;
});

var pixelWidth = 1300;
var pixelHeight = 700;

var xOffsetPercentLeft = 2;
var xOffsetPercentRight = 15;
var yOffsetPercent = 10;

var data = temps.map(t => ({ x: t, y: satPressFromTempIp(t) }));

var xExtent = d3.extent(data, el => el.x);

var xScale = d3
  .scaleLinear()
  .domain(xExtent)
  .range([
    (xOffsetPercentLeft * pixelWidth) / 100,
    pixelWidth - (xOffsetPercentRight * pixelWidth) / 100
  ]);
var yCanvasRange = [
  pixelHeight - (yOffsetPercent * pixelHeight) / 100,
  (yOffsetPercent * pixelHeight) / 100
];
var yScale = d3
  .scaleLinear()
  .domain([0, maxPv])
  .range(yCanvasRange);
var yScaleHumid = d3
  .scaleLinear()
  .domain([0, wFromPv(maxPv)])
  .range(yCanvasRange);

var saturationLine = d3
  .line()
  .x(d => xScale(d.x))
  .y(d => yScale(Math.min(d.y, maxPv)));

function boundaryLine(element) {
  return element
    .attr("fill", "none")
    .attr("stroke", "#000000")
    .attr("stroke-width", 2);
}

var svg = d3.select("svg");

svg.style("width", pixelWidth + "px");
svg.style("height", pixelHeight + "px");

svg
  .append("path")
  .attr("d", saturationLine(data))
  .call(boundaryLine);

svg
  .append("path")
  .attr("d", saturationLine([{ x: xExtent[0], y: 0 }, { x: xExtent[1], y: 0 }]))
  .call(boundaryLine);

svg
  .append("path")
  .attr(
    "d",
    saturationLine([
      { x: xExtent[0], y: 0 },
      { x: xExtent[0], y: satPressFromTempIp(xExtent[0]) }
    ])
  )
  .call(boundaryLine);

svg
  .append("path")
  .attr(
    "d",
    saturationLine([
      { x: xExtent[1], y: 0 },
      { x: xExtent[1], y: satPressFromTempIp(xExtent[1]) }
    ])
  )
  .call(boundaryLine);

var humidityStep = 0.002;

var constantHumidities = [];
for (i = humidityStep; i < wFromPv(maxPv); i = i + humidityStep) {
  constantHumidities.push(i);
}

var xAxis = d3
  .axisBottom()
  .scale(xScale)
  .tickValues(temps.filter(temp => temp % 5 === 0));
var yAxis = d3.axisRight().scale(yScale);
var yAxisHumid = d3
  .axisRight()
  .scale(yScale)
  .tickValues(constantHumidities.map(pvFromw))
  .tickFormat(d => wFromPv(d).toFixed(3));

svg
  .append("g")
  .attr("id", "xAxis")
  .attr("transform", "translate(0," + yScale(-0.005) + ")")
  .call(xAxis);
svg
  .append("g")
  .attr("id", "yAxis")
  .attr("transform", "translate(" + xScale(maxTemp + 5) + ",0)")
  .call(yAxis);
svg
  .append("g")
  .attr("id", "yAxisHumid")
  .attr("transform", "translate(" + xScale(maxTemp + 0.5) + ",0)")
  .call(yAxisHumid);

var constantTemps = [];
for (i = minTemp; i <= maxTemp; i++) {
  constantTemps.push(i);
}

var constantTempLines = constantTemps.map(temp => {
  return [{ x: temp, y: 0 }, { x: temp, y: satPressFromTempIp(temp) }];
});

constantTempLines.map(constantTempLine => {
  svg
    .append("path")
    .attr("class", "constantTemp")
    .attr("d", saturationLine(constantTempLine))
    .attr("fill", "none")
    .attr("stroke", "#000000")
    .attr("stroke-width", constantTempLine[0].x % 10 === 0 ? 0.9 : 0.5);
  //.on("mouseenter",  thickenLine )
  //.on("mouseout",  thickenLine );
});

var constantHumidityLines = constantHumidities.map(humidity => {
  pv = pvFromw(humidity);
  return [
    {
      x: pv < satPressFromTempIp(minTemp) ? minTemp : tempFromRhAndPv(1, pv),
      y: pv
    },
    { x: maxTemp, y: pv }
  ];
});

constantHumidityLines.map(humidityRatioLine =>
  svg
    .append("path")
    .attr("d", saturationLine(humidityRatioLine))
    .attr("fill", "none")
    .attr("stroke", "blue")
    .attr("stroke-width", 0.5)
);

var constantRHvalues = [];
for (i = 10; i < 100; i = i + 10) {
  constantRHvalues.push(i);
}

var constRHLines = constantRHvalues.map(rhValue => {
  if (pvFromTempRh(maxTemp, rhValue / 100) < maxPv) {
    return temps.map(temp => ({
      x: temp,
      y: (satPressFromTempIp(temp) * rhValue) / 100
    }));
  } else {
    tempAtBorder = tempFromRhAndPv(rhValue / 100, maxPv, minTemp, maxTemp);
    modTemps = temps.filter(
      temp => (satPressFromTempIp(temp) * rhValue) / 100 < maxPv
    );
    modTemps.push(tempAtBorder);
    return modTemps.map(temp => ({
      x: temp,
      y: (satPressFromTempIp(temp) * rhValue) / 100
    }));
  }
});

middleX = xScale((maxTemp + minTemp) / 2);

svg
  .append("text")
  .text("Dry bulb temperature / °F")
  .attr("x", middleX)
  .attr("y", yScale(-0.05));

svg
  .append("text")
  .text("ω")
  .attr("x", xScale(maxTemp + 5))
  .attr("y", yScale(maxPv / 2));
svg
  .append("text")
  .text("Pv")
  .attr("x", xScale(maxTemp + 8))
  .attr("y", yScale(maxPv / 2));
//.attr("transform", `rotate(-90,${xScale(maxTemp + 5)},${yScale(maxPv / 2)} )`);

constRHLines.map((rhLine, i) => {
  svg
    .append("path")
    .attr("d", saturationLine(rhLine))
    .attr("fill", "none")
    .attr("stroke", "red")
    .attr("stroke-width", 0.5);
});

function thickenLine() {
  d3.select(this).attr("stroke-width", "2");
}
function thinLine() {
  d3.select(this).attr("stroke-width", "1");
}

function humidityRatioFromEnthalpyTemp(enthalpy, temp) {
  return (enthalpy - 0.24 * temp) / (1061 + 0.445 * temp);
}

function enthalpyFromTempPv(temp, pv) {
  ω = wFromPv(pv);
  return 0.24 * temp + ω * (1061 + 0.445 * temp);
}

function satTempAtEnthalpy(enthalpy) {
  var currentLowTemp = 0;
  var currentHighTemp = maxTemp;

  var error = 1;
  var testTemp = (currentLowTemp + currentHighTemp) / 2;

  do {
    testTemp = (currentLowTemp + currentHighTemp) / 2;
    var testSatHumidityRatio = satHumidRatioFromTempIp(testTemp);
    var testHumidityRatio = humidityRatioFromEnthalpyTemp(enthalpy, testTemp);

    error = testSatHumidityRatio - testHumidityRatio;
    if (testSatHumidityRatio > testHumidityRatio) currentHighTemp = testTemp;
    else currentLowTemp = testTemp;
  } while (Math.abs(error) > 0.0000005);

  return testTemp;
}

maxEnthalpy = enthalpyFromTempPv(maxTemp, maxPv);
var constEnthalpyValues = [];
for (i = 8; i < maxEnthalpy; i++) {
  constEnthalpyValues.push(i);
}

constEnthalpyLines = constEnthalpyValues.map(enthalpyValue => {
  var lowTemp = satTempAtEnthalpy(enthalpyValue);

  var lowTempDataPoint;
  if (lowTemp < minTemp) {
    lowTemp = minTemp;
    lowTempDataPoint = {
      x: lowTemp,
      y: pvFromw(humidityRatioFromEnthalpyTemp(enthalpyValue, lowTemp))
    };
  } else if (satPressFromTempIp(lowTemp) > maxPv) {
    lowTempDataPoint = {
      x: tempFromEnthalpyPv(enthalpyValue, maxPv),
      y: maxPv
    };
  } else {
    lowTempDataPoint = {
      x: lowTemp,
      y: satPressFromTempIp(lowTemp)
    };
  }

  var highTemp = enthalpyValue / 0.24;
  if (highTemp > maxTemp) {
    highTemp = maxTemp;
  }

  var highTempDataPoint = {
    x: highTemp,
    y: pvFromw(humidityRatioFromEnthalpyTemp(enthalpyValue, highTemp))
  };

  return [lowTempDataPoint, highTempDataPoint];
});

var enthalpyPaths = svg.append("g").attr("id", "enthalpyLines");
constEnthalpyLines.map(enthalpyLine =>
  enthalpyPaths
    .append("path")
    .attr("d", saturationLine(enthalpyLine))
    .attr("class", "enthalpy")
    .attr("fill", "none")
    .attr("stroke", "green")
    .attr("stroke-width", 0.5)
);

var dewPointLabels = svg
  .append("g")
  .attr("id", "dewpointlabels")
  .attr("class", "ticks");
temps
  .filter(temp => temp % 5 === 0 && satPressFromTempIp(temp) < maxPv)
  .map(temp =>
    dewPointLabels
      .append("text")
      .text(temp)
      .attr("x", xScale(temp))
      .attr("y", yScale(satPressFromTempIp(temp) + 0.01))
      .attr("dx", "-0.5em")
  );

var rhticks = svg
  .append("g")
  .attr("class", "ticks")
  .attr("id", "rh-ticks");
constRHLines.map((rhLine, i) => {
  var temperatureForLabel = 85 - i;

  var xLocation = xScale(temperatureForLabel);

  var rh = i * 10 + 10;
  var pv = pvFromTempRh(temperatureForLabel, rh / 100);
  var yLocation = yScale(pv + 0.01);

  // Get derivative in psia/°F
  var derivative = dPvdT(rh / 100, temperatureForLabel);
  // Need to get in same units, pixel/pixel
  var rotationDegrees =
    (Math.atan(
      (derivative * (yScale(1) - yScale(0))) / (xScale(1) - xScale(0))
    ) *
      180) /
    Math.PI;

  var transformText =
    "rotate(" + rotationDegrees + "," + xLocation + "," + yLocation + ")";

  var rectangleElement = rhticks
    .append("rect")
    .attr("x", xLocation)
    .attr("y", yLocation)
    .attr("fill", "white");

  var textElement = rhticks
    .append("text")
    .attr("x", xLocation)
    .attr("y", yLocation)
    .attr("class", "rh-ticks")
    .text(i * 10 + 10 + "%");

  var boxheight = textElement.node().getBoundingClientRect().height;
  var boxwidth = textElement.node().getBoundingClientRect().width;

  rectangleElement
    .attr("width", boxwidth + 4)
    .attr("height", boxheight)
    .attr(
      "transform",
      `translate(-2, ${-boxheight + 3}) ` +
        `rotate(${rotationDegrees}, ${xLocation}, ${yLocation + boxheight})`
    );

  textElement.attr("transform", transformText);
});

updateGraph = () =>
  d3
    .select("#states")
    .selectAll("circle")
    .attr("cx", d => xScale(d.temperature()))
    .attr("cy", d => yScale(d.pv()));
updateStates = () =>
  states
    .data(viewModel.states())
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.temperature()))
    .attr("cy", d => yScale(d.pv()))
    .style("fill", "red")
    .attr("r", "5");

function stateTempω() {
  var self = this;

  self.temperature = ko.observable(80);
  self.humidityRatio = ko.observable(0.009);
  self.pv = ko.computed(() => pvFromw(self.humidityRatio()));
  self.temperature.subscribe(updateGraph);
  self.humidityRatio.subscribe(updateGraph);
}

function viewModel() {
  var self = this;

  self.states = ko.observableArray([new stateTempω()]);

  self.addState = () => {
    self.states.push(new stateTempω());
    updateStates();
  };

  self.showEnthalpyLines = ko.observable(true);

  self.showEnthalpyLines.subscribe(visible => {
    document.getElementById("enthalpyLines").style.visibility = visible
      ? "visible"
      : "hidden";
  });
}

var viewModel = new viewModel();

ko.applyBindings(viewModel);

svg.append("g").attr("id", "states");
var states = d3.select("#states").selectAll("circle");
updateStates();
