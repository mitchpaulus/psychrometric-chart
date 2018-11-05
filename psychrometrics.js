/* global ko, d3 */

const c8 = -1.0440397e4;
const c9 = -1.129465e1;
const c10 = -2.7022355e-2;
const c11 = 1.289036e-5;
const c12 = -2.4780681e-9;
const c13 = 6.5459673;

const totalPressure = 14.696; // psia.
const minTemp = 32;

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

    var psatMin = 0
    var psatMax = satPressFromTempIp(200);

    if (pv < psatMin || pv > psatMax) {
        throw new Error("pv must be within bounds of chart");
    }

    var goalPsat = pv / rh;

    var midTemp = (200 + minTemp) / 2;
    var psatMid = satPressFromTempIp(midTemp);

    var updatedMaxTemp = 200;
    var updatedMinTemp = 0;

    var iterations = 0;
    while (Math.abs(psatMid - goalPsat) > 0.00001) {
        if (iterations > 500) {
            throw new Error(`Infinite loop in temp from Rh and Pv (rh=${rh}, pv=${pv}, diff=${Math.abs(psatMid - goalPsat)}.)`);
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

function tempPvFromvRh(v, rh) {
    var minpv = 0;
    var maxpv = 1;
    do {
        var pv = (maxpv + minpv) / 2;
        var testtemp = tempFromRhAndPv(rh, pv);
        var testv = vFromTempω(testtemp, wFromPv(pv));
        var diff = testv - v;
        if (diff > 0) {
            maxpv = pv;
        } else {
            minpv = pv;
        }
    } while (Math.abs(diff) > 0.0001)
    return { temp: testtemp, pv: pv };
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

    while (Math.abs(testResult) > 0.000001) {
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

var pixelWidth = 1300;
var pixelHeight = 700;

var xOffsetPercentLeft = 2;
var xOffsetPercentRight = 15;
var yOffsetPercent = 10;

var yCanvasRange = [
    pixelHeight - (yOffsetPercent * pixelHeight) / 100,
    (yOffsetPercent * pixelHeight) / 100
];



function boundaryLine(element) {
    return element
        .attr("fill", "none")
        .attr("stroke", "#000000")
        .attr("stroke-width", 2);
}

var svg = d3.select("svg");

svg.style("width", pixelWidth + "px");
svg.style("height", pixelHeight + "px");

var humidityStep = 0.002;


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

function satTempAtEnthalpy(enthalpy) {
    var currentLowTemp = 0;
    var currentHighTemp = 200;

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
        if (testSatHumidityRatio > testHumidityRatio) {
            currentHighTemp = testTemp;
        } else {
            currentLowTemp = testTemp;
        }
    } while (Math.abs(error) > 0.00005);

    return testTemp;
}

function isMult(val, mult) {
    return val % mult === 0;
}

var dewPointLabels = svg
    .append("g")
    .attr("id", "dewpointlabels")
    .attr("class", "ticks");

var constantRHvalues = [];
for (let i = 10; i < 100; i = i + 10) {
    constantRHvalues.push(i);
}

function StateTempω(maxTemp, maxω, name) {
    var self = this;

    self.temperature = ko.observable(getRandomInt(minTemp, maxTemp));
    var maxωrange = Math.min(satHumidRatioFromTempIp(self.temperature()), maxω);

    self.humidityRatio = ko.observable(Math.round(getRandomArbitrary(0, maxωrange) / 0.001) * 0.001);
    self.pv = ko.computed(() => pvFromw(self.humidityRatio()));
    self.name = ko.observable(name);
}

function ViewModel() {
    var self = this;
    var vPaths = svg.append("g").attr("id", "vpaths");
    svg.append("g").attr("id", "specific-humidity-lines");
    svg.append("g").attr("id", "x-axis");
    var wetBulbPaths = svg.append("g").attr("id", "wetbulb-lines");
    svg.append("g").attr("id", "yAxisHumid");
    var enthalpyPaths = svg.append("g").attr("id", "enthalpyLines");
    svg.append("g").attr("id", "rh-lines");
    svg.append("g").attr("id", "temp-lines");

    var enthalpyBorderPath = svg.append("g").attr("id", "enthalpy-border").append("path");
    var hLabels = svg.append("g").attr("id", "h-labels");
    svg.append("g").attr("id", "boundary-lines").append("path")
        .attr("stroke", "#000000")
        .attr("stroke-width", 2)
        .attr("fill", "none");

    svg.append("g").attr("id", "rh-label-background");
    var rhticks = svg
        .append("g")
        .attr("class", "ticks")
        .attr("id", "rh-ticks");

    svg.append("g").attr("id", "v-label-backgrounds");
    svg.append("g").attr("id", "v-labels");

    svg.append("g").attr("id", "wetbulb-labels");

    svg.append("g").attr("id", "states");
    svg.append("g").attr("id", "state-circles");
    svg.append("g").attr("id", "state-backgrounds");
    svg.append("g").attr("id", "state-text");

    self.maxTempInput = ko.observable("120").extend({ rateLimit: 500 });
    self.maxTemp = ko.computed(() => {
        var parsedValue = parseInt(self.maxTempInput());
        if (!isNaN(parsedValue) && parsedValue > minTemp) return parsedValue;
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

    self.pixelsPerTemp = ko.pureComputed(() => {
        return self.xScale()(1) - self.xScale()(0);
    });

    self.pixelsPerPsia = ko.pureComputed(() => {
        return self.yScale()(1) - self.yScale()(0);
    });

    self.maxω = ko.observable(0.03).extend({ rateLimit: 500 });
    self.maxPv = ko.pureComputed(() => {
        return pvFromw(self.maxω());
    });

    self.yScale = ko.pureComputed(() => {
        return d3
            .scaleLinear()
            .domain([0, self.maxPv()])
            .range(yCanvasRange);
    });

    self.yAxis = ko.pureComputed(() => {
        return d3.axisRight().scale(self.yScale());
    });

    self.saturationLine = ko.pureComputed(() => {
        return d3
            .line()
            .x(d => self.xScale()(d.x))
            .y(d => self.yScale()(Math.min(d.y, self.maxPv())));
    });

    self.tempAtCutoff = ko.pureComputed(() => tempFromRhAndPv(1, self.maxPv()));
    self.upperLeftBorderTemp = ko.pureComputed(() => {
        return self.tempAtCutoff() - 0.05 * (self.maxTemp() - minTemp);
    });

    self.bottomLeftBorderPv = ko.pureComputed(() => {
        return satPressFromTempIp(minTemp) + 0.05 * self.maxPv();
    });

    self.constantTemps = ko.pureComputed(() => {
        return range(minTemp, self.maxTemp(), 1);
    });

    self.constantTempLines = ko.computed(() => {
        return self.constantTemps().map(temp => {
            return [{ x: temp, y: 0 }, { x: temp, y: satPressFromTempIp(temp) }];
        });
    });


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
        var selection = d3.select("#specific-humidity-lines").selectAll("path").data(self.constantHumidityLines());
        selection.enter()
            .append("path")
            .attr("fill", "none")
            .attr("stroke", "blue")
            .attr("stroke-width", 0.5)
            .merge(selection)
            .attr("d", d => self.saturationLine()(d));

        selection.exit().remove();
    });

    self.xAxis = ko.computed(() => {
        return d3
            .axisBottom()
            .scale(self.xScale())
            .tickValues(range(minTemp, self.maxTemp(), 5).filter(temp => temp % 5 === 0));
    });

    ko.computed(() => {
        d3.select("#x-axis").attr("transform", "translate(0," + self.yScale()(-0.005) + ")");

        var axis = self.xAxis();
        d3.select("#x-axis").call(axis);
    });

    self.yAxisHumid = ko.computed(() => {
        return d3
            .axisRight()
            .scale(self.yScale())
            .tickValues(self.constantHumidities().map(pvFromw))
            .tickFormat(d => wFromPv(d).toFixed(3));
    });

    ko.computed(() => {
        d3.select("#yAxisHumid")
            .attr("transform", "translate(" + self.xScale()(parseInt(self.maxTemp()) + 0.5) + ",0)")
            .call(self.yAxisHumid());
    });

    // Want the temp diff to be 10% of total width, 9 labels.
    var tempdiff = ko.pureComputed(() => {
        return Math.round((self.maxTemp() - minTemp) * 0.15 / 9);
    });

    var starttemp = ko.pureComputed(() => {
        return Math.round(minTemp + (self.maxTemp() - minTemp) * 0.6);
    });

    self.constRHLines = ko.computed(() => {
        return constantRHvalues.map((rhValue, i) => {
            const mapFunction = temp => ({
                x: temp,
                y: (satPressFromTempIp(temp) * rhValue) / 100
            });
            var data;
            if (pvFromTempRh(self.maxTemp(), rhValue / 100) < self.maxPv()) {
                data = range(minTemp, self.maxTemp(), 0.5).map(mapFunction);
            } else {
                var tempAtBorder = tempFromRhAndPv(rhValue / 100, self.maxPv());
                data = range(minTemp, tempAtBorder, 0.5).map(mapFunction);
            }

            var temp = starttemp() - i * tempdiff();
            var pv = pvFromTempRh(temp, rhValue / 100)

            //// Get derivative in psia/°F
            var derivative = dPvdT(rhValue / 100, temp);
            //// Need to get in same units, pixel/pixel
            var rotationDegrees =
                (Math.atan(
                    (derivative * (self.yScale()(1) - self.yScale()(0))) / (self.xScale()(1) - self.xScale()(0))
                ) * 180) / Math.PI;

            return {
                rh: rhValue,
                temp: temp,
                pv: pv,
                data: data,
                rotationDegrees: rotationDegrees,
                x: self.xScale()(temp),
                y: self.yScale()(pv)
            }
        });
    });

    ko.computed(() => {
        var selection = d3.select("#rh-lines").selectAll("path").data(self.constRHLines());
        selection
            .enter()
            .append("path")
            .attr("fill", "none")
            .attr("stroke", "red")
            .attr("stroke-width", 0.5)
            .merge(selection)
            .attr("d", d => self.saturationLine()(d.data));

        selection.exit().remove();

        var height = 12;
        selection = d3.select("#rh-label-background").selectAll("rect");
        selection
            .data(self.constRHLines()).enter()
            .append("rect")
            .attr("width", 25)
            .attr("height", height)
            .attr("fill", "white")
            .merge(selection)
            .attr("x", d => self.xScale()(d.temp))
            .attr("y", d => self.yScale()(d.pv))
            .attr("transform", d => `rotate(${d.rotationDegrees}, ${d.x}, ${d.y}) translate(-2 -${height + 2})`);

        selection = rhticks.selectAll("text").data(self.constRHLines());
        selection.enter()
            .append("text")
            .attr("class", "rh-ticks")
            .text(d => d.rh + "%")
            .merge(selection)
            .attr("x", d => d.x)
            .attr("y", d => d.y)
            .attr("transform", d => `rotate(${d.rotationDegrees}, ${d.x}, ${d.y}) translate(0 -3)`);
    });

    var minv = vFromTempω(minTemp, 0);

    self.maxv = ko.computed(() => vFromTempω(self.maxTemp(), wFromPv(self.maxPv())));
    self.vValues = ko.computed(() => range(Math.ceil(minv / 0.1) * 0.1, Math.floor(self.maxv() / 0.1) * 0.1, 0.1));

    self.vLines = ko.computed(() => {
        return self.vValues().map(v => {
            var mapFunction = temp => { return { x: temp, y: pvFromw(ωFromTempv(temp, v)) }; };
            var lowerTemp;
            var upperTemp;

            if (v < vFromTempω(minTemp, satHumidRatioFromTempIp(minTemp))) {
                lowerTemp = minTemp;
                upperTemp = tempFromvω(v, 0);
            } else if (v < vFromTempω(self.tempAtCutoff(), wFromPv(self.maxPv()))) {
                // Will have to use trial and error solution.
                var testMinTemp = 0;
                var testMaxTemp = self.maxTemp();

                var testTemp = (testMinTemp + testMaxTemp) / 2;

                var ωsat = satHumidRatioFromTempIp(testTemp);
                var testω = ωFromTempv(testTemp, v);

                var iterations = 0;
                while (Math.abs(ωsat - testω) > 0.000001 && iterations < 1000) {
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

                lowerTemp = testTemp;
                upperTemp = Math.min(tempFromvω(v, 0), self.maxTemp());
            } else {
                lowerTemp = tempFromvω(v, wFromPv(self.maxPv()));
                upperTemp = Math.min(tempFromvω(v, 0), self.maxTemp());
            }

            var data = range(lowerTemp, upperTemp, 2).map(mapFunction);
            var labelLocation = tempPvFromvRh(v, 0.35);
            return { v: v, data: data, labelLocation: labelLocation };
        });
    });

    ko.computed(() => {
        var selection = vPaths.selectAll("path").data(self.vLines())
        selection.enter()
            .append("path")
            .attr("fill", "none")
            .attr("stroke", "purple")
            .merge(selection)
            .attr("d", d => self.saturationLine()(d.data));

        selection.exit().remove();

        var data = self.vLines().filter(d => d.v % 0.5 === 0);
        selection = d3.select("#v-labels").selectAll("text").data(data)
        selection.enter()
            .append("text")
            .attr("class", "ticks")
            .attr("text-anchor", "middle")
            .text(d => d.v.toFixed(1))
            .merge(selection)
            .attr("x", d => self.xScale()(d.labelLocation.temp))
            .attr("y", d => self.yScale()(d.labelLocation.pv))
        selection.exit().remove();

        selection = d3.select("#v-label-backgrounds").selectAll("rect").data(data)
        selection.enter()
            .append("rect")
            .attr("fill", "white")
            .attr("width", "25px")
            .attr("height", "15px")
            .merge(selection)
            .attr("x", d => self.xScale()(d.labelLocation.temp))
            .attr("y", d => self.yScale()(d.labelLocation.pv))
            .attr("transform", `translate(-12, -12)`);
    });

    function tempAtStraightEnthalpyLine(enthalpy) {
        var currentLowTemp = 0;
        var currentHighTemp = self.maxTemp();

        function straightLinePv(temp) {
            var rise = self.maxPv() - self.bottomLeftBorderPv();
            var run = (self.upperLeftBorderTemp()) - minTemp;

            return self.bottomLeftBorderPv() + (rise / run) * (temp - minTemp);
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

    var minEnthalpy = enthalpyFromTempPv(minTemp, 0);
    self.maxEnthalpy = ko.computed(() => {
        return enthalpyFromTempPv(self.maxTemp(), self.maxPv());
    });

    self.constEnthalpyValues = ko.computed(() => {
        return range(Math.ceil(minEnthalpy), Math.floor(self.maxEnthalpy()), 0.2);
    });

    self.enthalpyValueToLine = enthalpyValue => {
        var firstBoundaryEnthalpy = enthalpyFromTempPv(minTemp, satPressFromTempIp(minTemp) + 0.05 * self.maxPv());
        var secondBoundaryEnthalpy = enthalpyFromTempPv(self.upperLeftBorderTemp(), self.maxPv());

        var maxEnthalpyTemp = Math.min(enthalpyValue / 0.24, self.maxTemp());
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
        } else { // Top section
            return { h: enthalpyValue,
                coords: range(tempFromEnthalpyPv(enthalpyValue, self.maxPv()),
                    isMult(enthalpyValue, 5) ? maxEnthalpyTemp : satTempAtEnthalpy(enthalpyValue), 0.25).map(mapFunction)
            };
        }
    }

    self.constEnthalpyLines = ko.computed(() => self.constEnthalpyValues().map(self.enthalpyValueToLine));

    ko.computed(() => {
        var selection = enthalpyPaths.selectAll("path").data(self.constEnthalpyLines().filter(d => d.coords));
        selection.enter()
            .append("path")
            .attr("fill", "none")
            .attr("stroke", "green")
            .attr("stroke-width", d => {
                if (d.h % 5 === 0) {
                    return 1;
                } if (d.h % 1 === 0) {
                    return 0.75;
                }
                return 0.25;
            })
            .merge(selection)
            .attr("d", d => self.saturationLine()(d.coords));

        selection.exit().remove();
    });

    ko.computed(() => {
        var data = self.constEnthalpyValues().filter(h =>
            h % 5 === 0 &&
            h < enthalpyFromTempPv(self.upperLeftBorderTemp(), self.maxPv())
        )

        var selection = hLabels.selectAll("text").data(data);
        selection
            .enter()
            .append("text")
            .attr("class", "ticks")
            .text(d => d.toString())
            .merge(selection)
            .attr("x", h => self.xScale()(tempAtStraightEnthalpyLine(h) - 0.75))
            .attr("y", h => self.yScale()(pvFromEnthalpyTemp(h, tempAtStraightEnthalpyLine(h)) + 0.005));
        selection.exit().remove();
    });

    var minWetBulb = wetBulbFromTempω(minTemp, 0);
    self.maxWetBulb = ko.computed(() => wetBulbFromTempω(self.maxTemp(), wFromPv(self.maxPv())));
    self.wetBulbBottomRight = ko.computed(() => wetBulbFromTempω(self.maxTemp(), 0));
    self.wetBulbValues = ko.computed(() => range(Math.ceil(minWetBulb), Math.floor(self.maxWetBulb()), 1));

    self.wetBulbLines = ko.computed(() => {
        return self.wetBulbValues().map((wetbulbTemp) => {
            var mapFunction = temp => { return { y: pvFromw(ωFromWetbulbDryBulb(wetbulbTemp, temp)), x: temp }; };

            var lowerTemp;
            var upperTemp;
            if (wetbulbTemp < minTemp) {
                lowerTemp = minTemp;
                upperTemp = tempFromWetbulbBottomBorder(wetbulbTemp);
            } else if (wetbulbTemp < self.wetBulbBottomRight()) {
                lowerTemp = wetbulbTemp;
                upperTemp = tempFromWetbulbBottomBorder(wetbulbTemp);
            } else if (wetbulbTemp < self.tempAtCutoff()) {
                lowerTemp = wetbulbTemp;
                upperTemp = self.maxTemp();
            } else {
                lowerTemp = tempFromWetbulbω(wetbulbTemp, wFromPv(self.maxPv()));
                upperTemp = self.maxTemp();
            }

            var data = range(lowerTemp, upperTemp, 3).map(mapFunction);
            var midtemp = (upperTemp + lowerTemp) / 2;
            var midpv = mapFunction(midtemp).y

            return { wetbulbTemp: wetbulbTemp, data: data, midtemp: midtemp, midpv: midpv }
        });
    });

    ko.computed(() => {
        var selection = wetBulbPaths.selectAll("path").data(self.wetBulbLines());
        selection.enter().append("path")
            .attr("fill", "none")
            .attr("stroke", "orange")
            .attr("stroke-dasharray", "1 1")
            .attr("stroke-width", 0.5)
            .merge(selection)
            .attr("d", d => self.saturationLine()(d.data));
        selection.exit().remove();

        var data = self.wetBulbLines().filter(d => d.wetbulbTemp % 5 === 0);
        selection = d3.select("#wetbulb-labels").selectAll("text").data(data)
        selection.enter()
            .append("text")
            .attr("class", "ticks")
            .style("font-size", "8px")
            .text(d => d.wetbulbTemp.toFixed(0))
            .merge(selection)
            .attr("x", d => self.xScale()(d.midtemp))
            .attr("y", d => self.yScale()(d.midpv));
        selection.exit().remove();
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


    ko.computed(() => {
        d3.select("#boundary-lines").select("path")
            .attr("d", self.saturationLine()(self.boundaryLineData()) + " Z");
    });


    ko.computed(() => {
        enthalpyBorderPath
            .attr(
                "d",
                self.saturationLine()([
                    { x: minTemp, y: satPressFromTempIp(minTemp) },
                    { x: minTemp, y: self.bottomLeftBorderPv() },
                    { x: self.upperLeftBorderTemp(), y: self.maxPv() },
                    { x: self.tempAtCutoff(), y: self.maxPv() }
                ])
            ).call(boundaryLine);
    });

    self.states = ko.observableArray([new StateTempω(self.maxTemp(), self.maxω(), "State 1")]);

    self.addState = () => {
        self.states.push(
            new StateTempω(self.maxTemp(), self.maxω(), "State " + (self.states().length + 1))
        );
    };

    self.removeState = (state) => { self.states.remove(state); };

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
            var element = document.getElementById(o.id);
            if (element) {
                element.style.visibility = self[o.obs]()
                    ? "visible"
                    : "hidden";
            }
        });
    });

    ko.computed(() => {
        var rightOffset = 10;

        var selection = d3.select("#state-text").selectAll("text").data(self.states());
        selection
            .enter()
            .append("text")
            .merge(selection)
            .attr("x", d => self.xScale()(d.temperature()))
            .attr("y", d => self.yScale()(d.pv()))
            .attr("dx", rightOffset)
            .attr("dy", "-10")
            .text((d, i) => d.name());
        selection.exit().remove();

        // Once the text has been created we can get the
        // the size of the bounding box to put the background
        // behind.

        var boundingBoxes = [];
        d3.select("#state-text").selectAll("text").each(function (d, i) {
            boundingBoxes[i] = this.getBoundingClientRect();
        });

        selection = d3.select("#state-backgrounds").selectAll("rect").data(self.states());
        selection
            .enter()
            .append("rect")
            .merge(selection)
            .attr("x", d => self.xScale()(d.temperature()))
            .attr("y", d => self.yScale()(d.pv()))
            .attr("transform", (d, i) => `translate(${rightOffset - Math.round(boundingBoxes[i].width * 0.1 / 2)}, -25)`)
            .attr("width", (d, i) => `${Math.ceil(boundingBoxes[i].width * 1.1)}px`)
            .attr("height", "20px")
            .attr("fill", "white")
        selection.exit().remove();


        selection = d3.select("#state-circles").selectAll("circle").data(self.states());
        selection
            .enter()
            .append("circle")
            .style("fill", "red")
            .attr("r", "5")
            .merge(selection)
            .attr("cx", d => self.xScale()(d.temperature()))
            .attr("cy", d => self.yScale()(d.pv()))
        selection.exit().remove();
    });

    var yAxisSelection = svg.append("g").attr("id", "yAxis")
    var pvAxisTemp = self.maxTemp() + 6;
    var middleX = self.xScale()((self.maxTemp() + minTemp) / 2);

    yAxisSelection
        .attr("transform", "translate(" + self.xScale()(pvAxisTemp) + ",0)")
        .call(self.yAxis());

    svg.append("text")
        .text("Dry bulb temperature / °F")
        .attr("x", middleX)
        .attr("y", self.yScale()(-0.05));

    svg.append("text")
        .text("ω")
        .attr("x", self.xScale()(self.maxTemp() + 4))
        .attr("y", self.yScale()(self.maxPv() / 2));


    var pvAxisX = self.xScale()(pvAxisTemp + 5);
    var pvAxisY = self.yScale()(self.maxPv() / 2);
    svg.append("text")
        .text("Pv / psia")
        .attr("x", pvAxisX)
        .attr("y", pvAxisY)
        .attr("transform", `rotate(-90, ${pvAxisX}, ${pvAxisY})`);

    svg.append("text").attr("id", "enthalpy-label").text("Enthalpy / Btu per lb d.a.")

    ko.computed(() => {
        var rise = self.maxPv() - self.bottomLeftBorderPv();
        var run = self.upperLeftBorderTemp() - minTemp;

        var angle = Math.atan((rise * self.pixelsPerPsia()) / (run * self.pixelsPerTemp())) * 180 / Math.PI;

        d3.select("#enthalpy-label")
            .attr("x", self.xScale()(50))
            .attr("y", self.yScale()(0.4))
            .attr("transform", `rotate(${angle}, ${self.xScale()(50)}, ${self.yScale()(0.4)})`);
    });


    ko.computed(() => {
        var selection = dewPointLabels.selectAll("text")
            .data(
                self.constantTemps().filter(temp => temp % 5 === 0 && satPressFromTempIp(temp) < self.maxPv())
            )
        selection.enter()
            .append("text")
            .text(d => d.toString())
            .attr("dx", "-0.5em")
            .merge(selection)
            .attr("x", d => self.xScale()(d))
            .attr("y", d => self.yScale()(satPressFromTempIp(d) + 0.01));
        selection.exit().remove();
    });

    self.blobUrl = ko.pureComputed(() => {
        var blob = new Blob([d3.select("#vizcontainer").node().innerHTML], { type: "image/svg+xml" });
        return URL.createObjectURL(blob);
    });

    self.savePng = () => saveSvgAsPng(document.getElementById("chartsvg"), "chart.png", { backgroundColor: "white" })
}

var viewModel = new ViewModel();
ko.applyBindings(viewModel);

