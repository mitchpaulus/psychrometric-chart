/* global ko, d3 */

const c8 = -1.0440397e4;
const c9 = -1.129465e1;
const c10 = -2.7022355e-2;
const c11 = 1.289036e-5;
const c12 = -2.4780681e-9;
const c13 = 6.5459673;

const totalPressure = 14.696; // psia.
const maxPv = pvFromw(0.03);
const minTemp = 32;
const maxTemp = 120;

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
}

function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

// Utility method that guarantees that min and max are exactly
// as input, with the step size based on 0.
function range(min, max, stepsize) {
    var parsedMin = parseFloat(min);
    var toReturn = parsedMin % stepsize === 0 ? [] : [parsedMin];
    var n = 0;
    var baseValue = stepsize * Math.ceil(parsedMin / stepsize);
    while (baseValue + n * stepsize < parseFloat(max)) {
        toReturn.push(baseValue + n * stepsize);
        n = n + 1;
    }

    toReturn.push(max)
    return toReturn;
}

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

function satHumidRatioFromTempIp(temp) {
    var satPress = satPressFromTempIp(temp);
    return (0.621945 * satPress) / (totalPressure - satPress);
}

function wFromPv(pv) {
    return (0.621945 * pv) / (totalPressure - pv);
}

function pvFromw(w) {
    if (typeof w === "string") w = parseFloat(w);
    if (w < 0.000001) return 0;
    return totalPressure / (1 + 0.621945 / w);
}

// partial pressure of vapor from dry bulb temp (°F) and rh (0-1)
function pvFromTempRh(temp, rh) {
    return rh * satPressFromTempIp(temp);
}

function tempFromRhAndPv(rh, pv) {
    if (!rh || rh > 1) throw new Error("RH value must be between 0-1");

    var psatMin = satPressFromTempIp(minTemp);
    var psatMax = satPressFromTempIp(maxTemp);

    if (pv < psatMin || pv > psatMax) {
        throw new Error("pv must be within bounds of chart");
    }

    var goalPsat = pv / rh;

    var midTemp = (maxTemp + minTemp) / 2;
    var psatMid = satPressFromTempIp(midTemp);

    var updatedMaxTemp = maxTemp;
    var updatedMinTemp = minTemp;

    var iterations = 0;
    while (Math.abs(psatMid - goalPsat) > 0.00000001) {
        if (iterations > 500) {
            throw new Error("Infinite loop in temp from Rh and Pv.");
        }
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
    var ω = wFromPv(pv);
    return (h - ω * 1061) / (0.24 + ω * 0.445);
}

function wetBulbFromTempω(temp, ω) {
    // Function we'd like to 0.
    function testWetbulbResult(testWetbulb) {
        var satωAtWetBulb = satHumidRatioFromTempIp(testWetbulb);

        return ((1093 - 0.556 * testWetbulb) * satωAtWetBulb - 0.24 * (temp - testWetbulb)) /
            (1093 + 0.444 * temp - testWetbulb) - ω;
    }

    var updatedMaxTemp = temp;
    var updatedMinTemp = 0;

    var testTemp = (updatedMaxTemp + updatedMinTemp) / 2;

    var iterations = 0;

    var testResult = testWetbulbResult(testTemp);

    while (Math.abs(testResult) > 0.00000001) {
        if (iterations > 500) {
            throw new Error("Infinite loop in temp from Rh and Pv.");
        }

        if (testResult > 0) {
            updatedMaxTemp = testTemp;
            testTemp = (updatedMaxTemp + updatedMinTemp) / 2;
        } else {
            updatedMinTemp = testTemp;
            testTemp = (updatedMaxTemp + updatedMinTemp) / 2;
        }

        testResult = testWetbulbResult(testTemp);
        iterations++;
    }

    return testTemp;
}

function tempFromWetbulbω(wetBulb, ω) {
    var ωsatWetBulb = satHumidRatioFromTempIp(wetBulb);
    return ((1093 - 0.556 * wetBulb) * ωsatWetBulb + 0.24 * wetBulb - ω * (1093 - wetBulb)) / (0.444 * ω + 0.24);
}

function tempFromWetbulbBottomBorder(wetbulbTemp) {
    var ωsatWetBulb = satHumidRatioFromTempIp(wetbulbTemp);
    return ((1093 - 0.556 * wetbulbTemp) * ωsatWetBulb + 0.24 * wetbulbTemp) / 0.24;
}

function ωFromWetbulbDryBulb(wetbulbTemp, temp) {
    var ωsatWetBulb = satHumidRatioFromTempIp(wetbulbTemp);
    return ((1093 - 0.556 * wetbulbTemp) * ωsatWetBulb - 0.24 * (temp - wetbulbTemp)) / (1093 + 0.444 * temp - wetbulbTemp);
}

function vFromTempω(temp, ω) {
    return 0.370486 * (temp + 459.67) * (1 + 1.607858 * ω) / totalPressure;
}

function tempFromvω(v, ω) {
    return (v * totalPressure) / (0.370486 * (1 + 1.607858 * ω)) - 459.67;
}

function ωFromTempv(temp, v) {
    var numerator = (totalPressure * v) / (0.370486 * (temp + 459.67)) - 1;
    return numerator / 1.607858;
}

// Calculate derivative of pv vs. T
function dPvdT(rh, temp) {
    var absTemp = temp + 459.67;
    var term1 =
        -c8 / (absTemp * absTemp) +
        c10 +
        2 * c11 * absTemp +
        3 * c12 * absTemp * absTemp +
        c13 / absTemp;
    return rh * satPressFromTempIp(temp) * term1;
}

const tempAtCutoff = tempFromRhAndPv(1, maxPv);
const upperLeftBorderTemp = tempAtCutoff - 0.05 * (maxTemp - minTemp);
const bottomLeftBorderPv = satPressFromTempIp(minTemp) + 0.05 * maxPv;

var temps = [];
for (let i = minTemp; i <= maxTemp; i = i + 0.5) {
    temps.push(i);
}

temps.push(tempAtCutoff);
temps = temps.sort(function (a, b) {
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

svg.append("path").attr(
    "d",
    saturationLine([
        { x: minTemp, y: satPressFromTempIp(minTemp) },
        { x: minTemp, y: bottomLeftBorderPv },
        { x: upperLeftBorderTemp, y: maxPv },
        { x: tempAtCutoff, y: maxPv }
    ])
).call(boundaryLine);

var humidityStep = 0.002;


var yAxis = d3.axisRight().scale(yScale);

var pvAxisTemp = maxTemp + 6;


svg.append("g")
    .attr("id", "yAxis")
    .attr("transform", "translate(" + xScale(pvAxisTemp) + ",0)")
    .call(yAxis);

var middleX = xScale((maxTemp + minTemp) / 2);

svg.append("text")
    .text("Dry bulb temperature / °F")
    .attr("x", middleX)
    .attr("y", yScale(-0.05));

svg.append("text")
    .text("ω")
    .attr("x", xScale(maxTemp + 4))
    .attr("y", yScale(maxPv / 2));
svg.append("text")
    .text("Pv / psia")
    .attr("x", xScale(pvAxisTemp + 3))
    .attr("y", yScale(maxPv / 2));
//.attr("transform", `rotate(-90,${xScale(maxTemp + 5)},${yScale(maxPv / 2)} )`);

function humidityRatioFromEnthalpyTemp(enthalpy, temp) {
    return (enthalpy - 0.24 * temp) / (1061 + 0.445 * temp);
}

function enthalpyFromTempPv(temp, pv) {
    var ω = wFromPv(pv);
    return 0.24 * temp + ω * (1061 + 0.445 * temp);
}

function pvFromEnthalpyTemp(enthalpy, temp) {
    return pvFromw(humidityRatioFromEnthalpyTemp(enthalpy, temp));
}

function tempAtStraightEnthalpyLine(enthalpy) {
    var currentLowTemp = 0;
    var currentHighTemp = maxTemp;

    function straightLinePv(temp) {
        var rise = maxPv - bottomLeftBorderPv;
        var run = (upperLeftBorderTemp) - minTemp;

        return bottomLeftBorderPv + (rise / run) * (temp - minTemp);
    }

    var error = 1;

    do {
        var testTemp = (currentLowTemp + currentHighTemp) / 2;
        var testPvOnStraightLine = straightLinePv(testTemp);

        //var testSatHumidityRatio = satHumidRatioFromTempIp(testTemp);
        var testPv = pvFromEnthalpyTemp(enthalpy, testTemp);

        error = testPvOnStraightLine - testPv;
        if (testPvOnStraightLine > testPv) {
            currentHighTemp = testTemp;
        } else {
            currentLowTemp = testTemp;
        }
    } while (Math.abs(error) > 0.0000005);

    return testTemp;
}

function satTempAtEnthalpy(enthalpy) {
    var currentLowTemp = 0;
    var currentHighTemp = maxTemp;

    var error = 1;
    var testTemp = (currentLowTemp + currentHighTemp) / 2;

    do {
        testTemp = (currentLowTemp + currentHighTemp) / 2;
        var testSatHumidityRatio = satHumidRatioFromTempIp(testTemp);
        var testHumidityRatio = humidityRatioFromEnthalpyTemp(
            enthalpy,
            testTemp
        );

        error = testSatHumidityRatio - testHumidityRatio;
        if (testSatHumidityRatio > testHumidityRatio) 
            currentHighTemp = testTemp;
        else currentLowTemp = testTemp;
    } while (Math.abs(error) > 0.000000005);

    return testTemp;
}

var minEnthalpy = enthalpyFromTempPv(minTemp, 0);
var maxEnthalpy = enthalpyFromTempPv(maxTemp, maxPv);

function isMult(val, mult) {
    return val % mult === 0;
}

var constEnthalpyValues = range(Math.ceil(minEnthalpy), Math.floor(maxEnthalpy), 0.2);

const pixelsPerDegF = xScale(1) - xScale(0);
const tempDifference = 0.05 * (maxTemp - minTemp);
const upperEnthalpyCornerTemp = tempAtCutoff - tempDifference;
const lowerEnthalpyCornerPv =
    satPressFromTempIp(minTemp) +
    (tempDifference * pixelsPerDegF) / (yScale(1) - yScale(0));

const enthalpyBorderSlope =
    (maxPv - lowerEnthalpyCornerPv) / (upperEnthalpyCornerTemp - minTemp);

var constEnthalpyLines = constEnthalpyValues.map(enthalpyValue => {
    var firstBoundaryEnthalpy = enthalpyFromTempPv(minTemp, satPressFromTempIp(minTemp) + 0.05 * maxPv);
    var secondBoundaryEnthalpy = enthalpyFromTempPv(upperLeftBorderTemp, maxPv);

    var maxEnthalpyTemp = enthalpyValue / 0.24 > maxTemp ? maxTemp : enthalpyValue / 0.24;
    var mapFunction = temp => { return { x: temp, y: pvFromEnthalpyTemp(enthalpyValue, temp) }; };
    if (enthalpyValue < firstBoundaryEnthalpy) {
        if (enthalpyValue % 5 === 0) {
            return { h: enthalpyValue, coords: range(minTemp, maxEnthalpyTemp, 0.25).map(mapFunction) };
        } else {
            return { h: enthalpyValue, coords: range(minTemp, satTempAtEnthalpy(enthalpyValue), 0.25).map(mapFunction) };
        }
    } else if (enthalpyValue < secondBoundaryEnthalpy) {
        var tempAtBorder = tempAtStraightEnthalpyLine(enthalpyValue);
        return { h: enthalpyValue, coords: range(tempAtBorder, enthalpyValue % 5 === 0 ? maxEnthalpyTemp : satTempAtEnthalpy(enthalpyValue), 0.25).map(mapFunction) };
    } else {
        return { h: enthalpyValue, coords: range(tempFromEnthalpyPv(enthalpyValue, maxPv), isMult(enthalpyValue, 5) ? maxEnthalpyTemp : satTempAtEnthalpy(enthalpyValue), 0.25).map(mapFunction) };
    }
});


var enthalpyPaths = svg.append("g").attr("id", "enthalpyLines");

enthalpyPaths.selectAll("path").data(constEnthalpyLines.filter(d => d.coords)).enter()
    .append("path")
    .attr("d", d => saturationLine(d.coords))
//.attr("class", "enthalpy")
    .attr("fill", "none")
    .attr("stroke", "green")
    .attr("stroke-width", d => {
        if (d.h % 5 === 0) {
            return 1;
        } if (d.h % 1 === 0) {
            return 0.75;
        }
        return 0.25;
    });

var hLabels = svg.append("g");
hLabels.selectAll("text").data(constEnthalpyValues.filter(h => h % 5 === 0))
    .enter()
    .append("text")
    .attr("class", "ticks")
    .text(d => d.toString())
    .attr("x", h => xScale(tempAtStraightEnthalpyLine(h) - 0.75))
    .attr("y", h => yScale(pvFromEnthalpyTemp(h, tempAtStraightEnthalpyLine(h)) + 0.005));


var minWetBulb = wetBulbFromTempω(minTemp, 0);
var maxWetBulb = wetBulbFromTempω(maxTemp, wFromPv(maxPv));
var wetBulbBottomRight = wetBulbFromTempω(maxTemp,0);



var wetBulbValues = range(Math.ceil(minWetBulb), Math.floor(maxWetBulb), 1);


var wetBulbPaths = svg.append("g").attr("id", "wetbulb-lines");

var wetBulbLines = wetBulbValues.map((wetbulbTemp) => {

    var mapFunction = temp => { return { y: pvFromw(ωFromWetbulbDryBulb(wetbulbTemp, temp)), x: temp }; };

    if (wetbulbTemp < minTemp) {
        return range(minTemp, tempFromWetbulbBottomBorder(wetbulbTemp), 0.5).map(mapFunction);
    } else if (wetbulbTemp < wetBulbBottomRight) {
        return range(wetbulbTemp, tempFromWetbulbBottomBorder(wetbulbTemp), 0.5).map(mapFunction);
    } else if (wetbulbTemp < tempAtCutoff) {
        return range(wetbulbTemp, maxTemp, 0.5).map(mapFunction);
    } else {
        return range(tempFromWetbulbω(wetbulbTemp, wFromPv(maxPv)), maxTemp, 0.5).map(mapFunction);
    }
});


wetBulbPaths.selectAll("path").data(wetBulbLines).enter().append("path").attr("d", d => saturationLine(d))
    .attr("fill", "none")
    .attr("stroke", "orange")
    .attr("stroke-dasharray", "1 1")
    .attr("stroke-width", 0.5);


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

var constantRHvalues = [];
for (let i = 10; i < 100; i = i + 10) {
    constantRHvalues.push(i);
}


function StateTempω() {
    var self = this;

    self.temperature = ko.observable(getRandomInt(minTemp, maxTemp));

    var maxHumid = Math.min(satHumidRatioFromTempIp(self.temperature()), wFromPv(maxPv));

    self.humidityRatio = ko.observable(Math.round(getRandomArbitrary(0, maxHumid) / 0.001) * 0.001);
    self.pv = ko.computed(() => pvFromw(self.humidityRatio()));
}

function ViewModel() {
    var self = this;
    self.maxTempInput = ko.observable("120");
    self.maxTemp = ko.computed(() => {
        var parsedValue = parseInt(self.maxTempInput());
        if (!isNaN(parsedValue)) return parsedValue;
        return 120;
    });

    self.xScale = ko.computed(() => {
        return d3.scaleLinear()
            .domain([minTemp, self.maxTemp()])
            .range([
                (xOffsetPercentLeft * pixelWidth) / 100,
                pixelWidth - (xOffsetPercentRight * pixelWidth) / 100
            ]);
    });

    self.saturationLine = ko.computed(() => {
        return d3
            .line()
            .x(d => self.xScale()(d.x))
            .y(d => yScale(Math.min(d.y, self.maxPv())));
    });

    self.maxPv = ko.observable(pvFromw(0.03));

    self.constantTemps = ko.computed(() => {
        return range(minTemp, self.maxTemp(), 1);
    });

    self.constantTempLines = ko.computed(() => {
        return self.constantTemps().map(temp => {
            return [{ x: temp, y: 0 }, { x: temp, y: satPressFromTempIp(temp) }];
        });
    });

    svg.append("g").attr("id", "temp-lines");

    ko.computed(function () {
        var selection = d3.select("#temp-lines")
            .selectAll("path")
            .data(self.constantTempLines());

        selection
            .enter()
            .append("path")
            .merge(selection)
            .attr("d", d => self.saturationLine()(d))
            .attr("fill", "none")
            .attr("stroke", "#000000")
            .attr("stroke-width", d => d[0].x % 10 === 0 ? 1 : 0.5);

        selection.exit().remove();
    });

    svg.append("g").attr("id", "specific-humidity-lines");

    self.constantHumidities = ko.computed(() => {
        var constantHumidities = [];
        for (let i = humidityStep; i < wFromPv(self.maxPv()); i = i + humidityStep) {
            constantHumidities.push(i);
        }
        return constantHumidities;
    });

    self.constantHumidityLines = ko.computed(() => {
        return self.constantHumidities().map(humidity => {
            var pv = pvFromw(humidity);
            return [
                {
                    x: pv < satPressFromTempIp(minTemp) ? minTemp : tempFromRhAndPv(1, pv),
                    y: pv
                },
                { x: self.maxTemp(), y: pv }
            ];
        });
    });

    ko.computed(() => {
        var selection = d3.select("#specific-humidity-lines").selectAll("path").data(self.constantHumidityLines())
        selection.enter()
            .append("path")
            .attr("fill", "none")
            .attr("stroke", "blue")
            .attr("stroke-width", 0.5)
            .merge(selection)
            .attr("d", d => self.saturationLine()(d))
    });

    svg.append("g").attr("id", "x-axis")

    self.xAxis = ko.computed(() => {
        return d3
            .axisBottom()
            .scale(self.xScale())
            .tickValues(range(minTemp, self.maxTemp(), 5).filter(temp => temp % 5 === 0));
    });

    debugger;

    ko.computed(() => {
        d3.select("#x-axis").attr("transform", "translate(0," + yScale(-0.005) + ")");
        console.log("reached here")

        var axis = self.xAxis()
        d3.select("#x-axis").call(axis);
    });

    self.yAxisHumid = ko.computed(() => {
        return d3
            .axisRight()
            .scale(yScale)
            .tickValues(self.constantHumidities().map(pvFromw))
            .tickFormat(d => wFromPv(d).toFixed(3));
    });

    svg.append("g").attr("id", "yAxisHumid");

    ko.computed(() => {
        d3.select("#yAxisHumid")
            .attr("transform", "translate(" + self.xScale()(parseInt(self.maxTemp()) + 0.5) + ",0)")
            .call(self.yAxisHumid());
    });

    svg.append("g").attr("id", "rh-lines");

    self.constRHLines = ko.computed(() => {
        return constantRHvalues.map(rhValue => {
            const mapFunction = temp => ({
                x: temp,
                y: (satPressFromTempIp(temp) * rhValue) / 100
            });
            if (pvFromTempRh(self.maxTemp(), rhValue / 100) < self.maxPv()) {
                return range(minTemp, self.maxTemp(), 0.5).map(mapFunction);
            } else {
                var tempAtBorder = tempFromRhAndPv(rhValue / 100, self.maxPv());
                return range(minTemp, tempAtBorder, 0.5).map(mapFunction);
            }
        });
    });

    ko.computed(() => {
        var selection = d3.select("#rh-lines").selectAll("path").data(self.constRHLines())
        selection
            .enter()
            .append("path")
            .attr("fill", "none")
            .attr("stroke", "red")
            .attr("stroke-width", 0.5)
            .merge(selection)
            .attr("d", d => self.saturationLine()(d))

        selection.exit().remove();
    })

    var minv = vFromTempω(minTemp, 0);

    self.maxv = ko.computed(() => vFromTempω(self.maxTemp(), wFromPv(self.maxPv())));
    self.vValues = ko.computed(() => range(Math.ceil(minv / 0.1) * 0.1, Math.floor(self.maxv() / 0.1) * 0.1, 0.1));

    self.vLines = ko.computed(() => {
        return self.vValues().map(v => {
            var mapFunction = temp => { return { x: temp, y: pvFromw(ωFromTempv(temp, v)) }; };
            if (v < vFromTempω(minTemp, satHumidRatioFromTempIp(minTemp))) {
                return range(minTemp, tempFromvω(v, 0), 0.5).map(mapFunction);
            }
            if (v < vFromTempω(tempAtCutoff, wFromPv(self.maxPv()))) {
                // Will have to use trial and error solution.
                var testMinTemp = 0;
                var testMaxTemp = self.maxTemp();

                var testTemp = (testMinTemp + testMaxTemp) / 2;

                var ωsat = satHumidRatioFromTempIp(testTemp);
                var testω = ωFromTempv(testTemp, v);

                var iterations = 0;
                while (Math.abs(ωsat - testω) > 0.00000001 && iterations < 1000) {
                    if (ωsat > testω) {
                        testMaxTemp = testTemp;
                    } else {
                        testMinTemp = testTemp;
                    }
                    testTemp = (testMinTemp + testMaxTemp) / 2;

                    ωsat = satHumidRatioFromTempIp(testTemp);
                    testω = ωFromTempv(testTemp, v);
                    iterations++;
                }
                if (iterations >= 1000) {
                    console.log("Infinite loop in calculating v lines.");
                }

                return range(testTemp, tempFromvω(v, 0), 0.5).map(mapFunction);
            } else {
                return range(tempFromvω(v, wFromPv(self.maxPv())), self.maxTemp(), 0.5).map(mapFunction);
            }
        });
    });

    var vPaths = svg.append("g").attr("id", "vpaths");

    ko.computed(() => {
        var selection = vPaths.selectAll("path").data(self.vLines())
        selection.enter()
            .append("path")
            .attr("fill", "none")
            .attr("stroke", "purple")
            .merge(selection)
            .attr("d", d => self.saturationLine()(d));

        selection.exit().remove();
    });

    self.constRHLines().map((rhLine, i) => {
        var temperatureForLabel = 85 - i;

        var xLocation = self.xScale()(temperatureForLabel);

        var rh = i * 10 + 10;
        var pv = pvFromTempRh(temperatureForLabel, rh / 100);
        var yLocation = yScale(pv + 0.01);

        // Get derivative in psia/°F
        var derivative = dPvdT(rh / 100, temperatureForLabel);
        // Need to get in same units, pixel/pixel
        var rotationDegrees =
            (Math.atan(
                (derivative * (yScale(1) - yScale(0))) / (self.xScale()(1) - self.xScale()(0))
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
                `rotate(${rotationDegrees}, ${xLocation}, ${yLocation +
                        boxheight})`
            );

        textElement.attr("transform", transformText);
    });

    self.boundaryLineData = ko.computed(() => {
        return [
            { x: self.maxTemp(), y: 0 },
            { x: minTemp, y: 0 },
            { x: minTemp, y: satPressFromTempIp(minTemp) },
            ...range(minTemp, tempFromRhAndPv(1, self.maxPv()), 0.1).map((temp) => { return { x: temp, y: satPressFromTempIp(temp) }; }),
            { x: tempFromRhAndPv(1, self.maxPv()), y: self.maxPv() },
            { x: self.maxTemp(), y: satPressFromTempIp(tempFromRhAndPv(1, self.maxPv())) },
            { x: self.maxTemp(), y: 0 }
        ]
    });

    svg.append("g").attr("id", "boundary-lines").append("path")
        .attr("stroke", "#000000")
        .attr("stroke-width", 2)
        .attr("fill", "none");

    ko.computed(() => {
        d3.select("#boundary-lines").select("path")
            .attr("d", self.saturationLine()(self.boundaryLineData()) + " Z")
    });

    self.states = ko.observableArray([new StateTempω()]);

    self.addState = () => {
        self.states.push(new StateTempω());
    };

    self.removeState = (state) => {
        self.states.remove(state);
    };

    var elementObservables = [
        { obs: "showEnthalpyLines", id: "enthalpyLines" },
        { obs: "showvLines", id: "vpaths" },
        { obs: "showω", id: "specific-humidity-lines" },
        { obs: "showTemp", id: "temp-lines" },
        { obs: "showWetBulb", id: "wetbulb-lines" },
        { obs: "showRh", id: "rh-lines" }
    ];

    elementObservables.map(o => {
        self[o.obs] = ko.observable(true);
        ko.computed(() => {
            var element = document.getElementById(o.id)
            if (element) {
                element.style.visibility = self[o.obs]()
                    ? "visible"
                    : "hidden";
            }
        })
    });

    svg.append("g").attr("id", "states");
    ko.computed(() => {
        var selection = d3.select("#states").selectAll("rect").data(self.states());
        selection
            .enter()
            .append("rect")
            .merge(selection)
            .attr("x", d => self.xScale()(d.temperature()))
            .attr("y", d => yScale(d.pv()))
            .attr("transform", "translate(0, -20)")
            .attr("width", "80px")
            .attr("height", "20px")
            .attr("fill", "white")

        selection.exit().remove();

        selection = d3.select("#states").selectAll("text").data(self.states());
        selection
            .enter()
            .append("text")
            .merge(selection)
            .attr("x", d => self.xScale()(d.temperature()))
            .attr("y", d => yScale(d.pv()))
            .attr("dx", 5)
            .attr("dy", -5)
            .text((d, i) => `State ${i + 1}`)
        selection.exit().remove();

        selection = d3.select("#states").selectAll("circle").data(self.states());
        selection
            .enter()
            .append("circle")
            .style("fill", "red")
            .attr("r", "5")
            .merge(selection)
            .attr("cx", d => self.xScale()(d.temperature()))
            .attr("cy", d => yScale(d.pv()))
        selection.exit().remove();
    });
}

var viewModel = new ViewModel();
ko.applyBindings(viewModel);
