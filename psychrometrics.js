const c8 =  -1.0440397e4
const c9 =  -1.1294650e1
const c10 = -2.7022355e-2
const c11 =  1.2890360e-5
const c12 = -2.4780681e-9
const c13 =  6.5459673

function satPressFromTempIp(temp) {
    var t = temp + 459.67;
    var lnOfSatPress = c8/t + c9 + c10*t + c11*Math.pow(t,2) + c12*Math.pow(t,3) + c13*Math.log(t);
    var satPress = Math.exp(lnOfSatPress)
    return satPress;
}

var totalPressure = 14.696; //psia.

function satHumidRatioFromTempIp(temp) {
    var satPress = satPressFromTempIp(temp);
    return 0.621945*satPress/(totalPressure - satPress);
}

function wFromPv(pv) {
    return 0.621945 * pv  / (totalPressure - pv);
}

function pvFromw(w) {
    return totalPressure / (1+ (0.621945/w)  );
}

const maxPv = 0.6;
const minTemp = 32;
const maxTemp = 115;

temps = [];
for (i = minTemp; i <= maxTemp; i = i + 0.5) {
    temps.push(i);
}

var pixelWidth = 1300;
var pixelHeight = 700;

var xOffsetPercent = 10;
var yOffsetPercent = 10;

var data = temps.map((t) =>({ x: t, y: satPressFromTempIp(t) }));

var xExtent = d3.extent(data, el => el.x);

var xScale = d3.scaleLinear().domain(xExtent).range([xOffsetPercent*pixelWidth/100, pixelWidth - xOffsetPercent*pixelWidth/100]);
var yCanvasRange = [pixelHeight - xOffsetPercent*pixelHeight/100, xOffsetPercent*pixelHeight/100]
var yScale = d3.scaleLinear().domain([0, maxPv]).range(yCanvasRange);
var yScaleHumid = d3.scaleLinear().domain([0, wFromPv(maxPv)]).range(yCanvasRange);

var saturationLine = d3.line().x( d => xScale(d.x)).y(d => yScale(Math.min(d.y, maxPv)));

function boundaryLine(element) {
    return element
    .attr("fill","none")
    .attr("stroke","#000000")
    .attr("stroke-width",2);
}

var svg = d3.select("svg")

svg.style("width", pixelWidth + "px") ;
svg.style("height", pixelHeight + "px") ;

svg.append("path")
    .attr("d", saturationLine(data)).call(boundaryLine)

svg.append("path")
    .attr("d", saturationLine([{x: xExtent[0], y: 0 }, { x: xExtent[1], y:0 } ]))
    .call(boundaryLine);

svg.append("path")
    .attr("d", saturationLine([{x: xExtent[0], y: 0 }, { x: xExtent[0], y: satPressFromTempIp( xExtent[0] ) } ]))
    .call(boundaryLine);

svg.append("path")
    .attr("d", saturationLine([{x: xExtent[1], y: 0 }, { x: xExtent[1], y: satPressFromTempIp( xExtent[1] ) } ]))
    .call(boundaryLine);

var humidityStep = 0.002;

var constantHumidities = [];
for (i = humidityStep; i < 0.026; i = i+humidityStep) {
   constantHumidities.push(i);
}

var xAxis = d3.axisBottom().scale(xScale).tickSize(5);
var yAxis = d3.axisRight().scale(yScale);
var yAxisHumid = d3.axisRight().scale(yScale).tickValues(constantHumidities.map(pvFromw)).tickFormat((d) => wFromPv(d).toFixed(3));

svg.append("g").attr("id","xAxis").attr("transform", "translate(0," + yScale(-0.005) + ")").call(xAxis);
svg.append("g").attr("id","yAxis").attr("transform", "translate(" + xScale(120) + ",0)").call(yAxis);
svg.append("g").attr("id","yAxisHumid").attr("transform", "translate(" + xScale(115) + ",0)").call(yAxisHumid);

var constantTemps = [];
for (i = minTemp; i <= maxTemp ; i++) {
    constantTemps.push(i);
}

var constantTempLines = constantTemps.map( (temp) => {
    return [ { x: temp, y: 0  }, {x: temp, y: satPressFromTempIp(temp) }]
});

constantTempLines.map((constantTempLine) => {
    svg.append("path")
        .attr("d", saturationLine(constantTempLine))
        .attr("fill","none")
        .attr("stroke", "#000000")
        .attr("stroke-width", 0.5)
        //.on("mouseenter",  thickenLine )
        //.on("mouseout",  thickenLine );
});


var constantHumidityLines = constantHumidities
    .map((humidity) => temps.map((temp) =>  ({x: temp, y: pvFromw(humidity) }) ).filter( (data) => satPressFromTempIp(data.x) > data.y ) );   

constantHumidityLines.map( (humidityRatioLine) => 
    svg.append("path").attr("d", saturationLine(humidityRatioLine))
        .attr("fill","none")
        .attr("stroke", "blue")
        .attr("stroke-width", 0.5)
);


var constantRHvalues = [];
for (i = 10; i < 100 ; i = i+10) {
    constantRHvalues.push(i);
}

var constRHLines = constantRHvalues.map( (rhValue) => 
    temps.filter((temp) => (satPressFromTempIp(temp)*rhValue / 100 ) < maxPv)
    .map( (temp) => ({ x: temp, y: satPressFromTempIp(temp) * rhValue / 100}))
    //.filter((data)=>data.y<maxPv)
);

constRHLines.map( (rhLine) => {  
    svg.append("path").attr("d", saturationLine(rhLine))
        .attr("fill","none")
        .attr("stroke", "red")
        .attr("stroke-width", 0.5);
});

function thickenLine() {
    d3.select(this).attr("stroke-width","2");
}
function thinLine() {
    d3.select(this).attr("stroke-width","1");
}

svg.append("text").attr("x",xScale(75)).attr("y",yScale(0.05)).text("10%");

var constEnthalpyValues = [];
for (i = 8; i < 50 ; i++) {
   constEnthalpyValues.push(i);
}

function humidityRatioFromEnthalpyTemp(enthalpy, temp) {
    return (enthalpy - 0.24*temp) / (1061+0.444*temp);
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
        if (testSatHumidityRatio > testHumidityRatio ) currentHighTemp = testTemp;
        else currentLowTemp = testTemp;
    }
    while (Math.abs(error) > 0.0000005)

    return testTemp;
}


constEnthalpyLines = constEnthalpyValues.map(
    (enthalpyValue) => {
        var lowTemp = satTempAtEnthalpy(enthalpyValue);

        var lowTempDataPoint;
        if (lowTemp < minTemp) {
            lowTemp = minTemp;
            lowTempDataPoint = {
                x: lowTemp,
                y: pvFromw(humidityRatioFromEnthalpyTemp(enthalpyValue, lowTemp))  
            }
        }
        else {
            var lowTempDataPoint = {
                x: lowTemp,
                y: satPressFromTempIp(lowTemp)
            }
        }

        var highTemp = enthalpyValue / 0.24;
        if (highTemp > maxTemp) {
            highTemp = maxTemp
        }

        var highTempDataPoint = {
            x: highTemp,
            y: pvFromw(humidityRatioFromEnthalpyTemp(enthalpyValue, highTemp) )
        }

        return [lowTempDataPoint, highTempDataPoint];
    });

constEnthalpyLines.map( (enthalpyLine) => svg.append("path").attr("d", saturationLine(enthalpyLine))   
    .attr("class","enthalpy")
        .attr("fill","none")
        .attr("stroke", "green")
        .attr("stroke-width", 0.5));


function viewModel() {
    var self = this;

    self.state = [{
        temperature:  ko.observable(80),
        pv:  ko.observable(0.1),
    } 
    ]

    self.state[0].temperature.subscribe( () =>  d3.select("#states").selectAll("circle").attr("cx", d => xScale(d.temperature())).attr("cy", d=> yScale(  d.pv()) )  );

    //self.temperature = ko.observable(50);
    //self.pv = ko.observable(0.1);
}

var viewModel = new viewModel(); 

ko.applyBindings(viewModel);

svg.append("g").attr("id","states");

var states = d3.select("#states").selectAll("circle");

states.data(viewModel.state).enter().append("circle").attr("cx", d => xScale(d.temperature())).attr("cy", d=> yScale(  d.pv()) ).style("fill","red").attr("r","10");
