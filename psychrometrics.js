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
    // Truncate the top of the chart.
    return satPress;
}

var totalPressure = 14.696; //psia.

function satHumidRatioFromTempIp(temp) {
    var satPress = satHumidRatioFromTempIp(temp);
    return 0.621945*satPress/(totalPressure - satPress);
}

function wFromPv(pv) {
    return 0.621945 * pv  / (totalPressure - pv);
}

function pvFromw(w) {
    return totalPressure / (1+ (0.621945/w)  );
}

const maxPv = 0.6;
const tempMin = 32;
const tempMax = 115;

temps = [];
for (i = tempMin; i <= tempMax; i = i + 0.5) {
    temps.push(i);
}

var pixelWidth = 1200;
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
for (i = tempMin; i <= tempMax ; i++) {
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
    temps
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

svg.append("text").attr("x",xScale(75)).attr("y",yScale(0.05)).text("10 %");

//temps.map( (temp) => {
    //svg.append("path").attr("d", 
//});

//
            //svg
        //.append("circle")
        //.attr("r", 20)
        //.attr("cx",20)
        //.attr("cy",20)
        //.style("fill","red");
//svg
    //.append("text")
    //.attr("id", "a")
    //.attr("x",20)
    //.attr("y",20)
    //.style("opacity", 0)
    //.text("HELLO WORLD");
//svg
    //.append("circle")
    //.attr("r", 100)
    //.attr("cx",400)
    //.attr("cy",400)
    //.style("fill","lightblue");
//svg
//.append("text")
//.attr("id", "b")
//.attr("x",400)
//.attr("y",400)
//.style("opacity", 0)
//.text("Uh, hi."); 
//d3.select("#a").transition().duration(2000).delay(1000).style("opacity", 1);
//d3.select("#b").transition().delay(3000).style("opacity", .75); 

