
function getXUrl_(symbol, from, to, g) {
  return "http://ichart.yahoo.com/x?s=" + encodeURIComponent(symbol) + "&a=" + (from.getMonth()) + "&b=" + from.getDate() + "&c=" + from.getFullYear() + "&d=" + (to.getMonth()) + "&e=" + to.getDate() + "&f=" + to.getFullYear() + "&g=" + g;
}

function getPricesFromTo(symbol, from, to) {
  var url = getXUrl_(symbol, from, to, "");
  data = UrlFetchApp.fetch(url).getContentText();

  var arrayOfLines = data.match(/[^\r\n]+/g);
  var res = [];
  for (var i = 0; i < arrayOfLines.length; i++) {
    var items = arrayOfLines[i].match(/[^\s,]+/g);
    if (!items || items.length != 7 || items[0].length !== 8) {
      continue;
    }
    var year = items[0].substring(0, 4);
    var month = items[0].substring(4, 6);
    var day = items[0].substring(6, 8);
    var closePrice = Number(items[4]);
    var adjClosePrice = Number(items[6]);
    
    res.push([new Date(year, month - 1, day, 0, 0, 0, 0), closePrice, adjClosePrice]);
  }
  
  return res;
}

function getClosePriceOnDate(symbol, date) {
  prices = getPricesFromTo(symbol, date, date);
  return prices[0][1];
}

function getAdjClosePriceOnDate(symbol, date) {
  prices = getPricesFromTo(symbol, date, date);
  return prices[0][2];
}

/**
 * Returns security dividends for a given date range.
 *
 * @param {string} The Yahoo finance quote of the company.
 * @param {date} From date.
 * @param {date} To date.
 * @return {number} A year, dividend table.
 */
function getDivFromTo(symbol, from, to) {
  if (symbol.indexOf("=") > 0) {
    return [];
  }

  var cache = CacheService.getPublicCache();
  var cacheKey = symbol + ":" + from + ":" + to;
  //cache.remove(cacheKey);
  var cached = cache.get(cacheKey);
  
  var data;
  if (cached != null) {
    data = cached;
  } else {
    var url = getXUrl_(symbol, from, to, "v");
    data = UrlFetchApp.fetch(url).getContentText();
    cache.put(cacheKey, data, 24*3600); // cache for 24 hours
  }

  var arrayOfLines = data.match(/[^\r\n]+/g);
  var res = [];
  var totalDiv = 0;
  for (var i = 0; i < arrayOfLines.length; i++) {
    var items = arrayOfLines[i].match(/[^\s,]+/g);
    if (!items || items.length != 3 || items[0] !== "DIVIDEND") {
      continue;
    }
    var year = items[1].substring(0, 4);
    var month = items[1].substring(4, 6);
    var day = items[1].substring(6, 8);
    var div = Number(items[2]);
    
    res.push([new Date(year, month - 1, day, 0, 0, 0, 0), div]);
    totalDiv += div;
  }
  
  return res;
}

function getDivTTM(symbol) {
  symbol = symbol || "T";
  var currentTime = new Date();
  var monthNow = currentTime.getMonth();

  var month = currentTime.getMonth();
  var year = currentTime.getFullYear() - 1;
  var yearNow = currentTime.getFullYear();

  var array = [];
  var url = "http://ichart.yahoo.com/x?s=" + symbol + "&a=" + month + "&b=01&c=" + year + "&d=" + monthNow + "&e=01&f=" + yearNow + "&g=v";
  var data = UrlFetchApp.fetch(url).getContentText();
  
  var arrayOfLines = data.match(/[^\r\n]+/g);
  var res = [];
  var totalDiv = 0;
  for (var i = 0; i < arrayOfLines.length; i++) {
    var items = arrayOfLines[i].match(/[^\s,]+/g);
    if (!items || items.length != 3 || items[0] !== "DIVIDEND") {
      continue;
    }

    totalDiv += Number(items[2]);
  }
  
  return totalDiv;
}

/**
 * Returns security dividends by year.
 *
 * @param {string} The Yahoo finance quote of the company.
 * @param {number} The number of years of history.
 * @return {number} A year, dividend table.
 */
function getDivByYear(symbol, years) {  
  var thisYear = (new Date()).getFullYear();
  var fromYear = thisYear - years;
  var fromDate = new Date(fromYear, 0, 1);
  var toDate = new Date(thisYear, 0, 1);
  var divs = getDivFromTo(symbol, fromDate, toDate);
  var result = [];
  for (var i = 0; i < divs.length; i++) {
    var item = divs[i];
    var year = item[0].getFullYear();
    if (i <= 0 || result[result.length - 1][0] !== year) {
      result.push([year, item[1]]);
    } else {
      result[result.length - 1][1] += item[1];
    }
  }
  
  return result;
}

/**
 * Returns the average dividend growth rate for a scurity.
 *
 * @param {string} The Yahoo finance quote of the company.
 * @param {number} The number of years of history.
 * @return {number} Average dividend growth per year.
 */
function getDivGrowthRate(symbol, years) {
  if (years <= 1) {
    return 0;
  }

  var divs = getDivByYear(symbol, years);
  var result = [];
  for (var i = 0; i < divs.length - 1; i++) {
    var item = divs[i];
    result.push((divs[i][1] - divs[i + 1][1]) / divs[i + 1][1]);
  }

  return result;
}

/**
 * Returns the average dividend growth rate for a scurity.
 *
 * @param {string} The Yahoo finance quote of the company.
 * @param {number} The number of years of history.
 * @param {string} Options string. If "n" is present return 0 if there is at least dividend decrease.
 * @return {number} Average dividend growth per year.
 */
function getDivAvgGrowthRate(symbol, years, opts) {
  opts = opts || "";
  if (years <= 1) {
    return 0;
  }

  var divGrowth = getDivGrowthRate(symbol, years);
  if (!divGrowth || divGrowth.length == 0) {
    return 0;
  }
  
  var sum = 0;
  var hasNegative = false;
  for (var i = 0; i < divGrowth.length; i++) {
    sum += divGrowth[i];
    hasNegative = hasNegative || (divGrowth[i] < 0);
  }
  
  var result = [sum / divGrowth.length];
  if (opts.indexOf("n") > -1 && hasNegative) {
    //result.push(hasNegative);
    result[0] = 0;
  }

  return result;
}

function test() {
  var currentTime = new Date(2016, 0, 1);
  var yearsAgo = new Date(2013, 0, 1);
  getDivAvgGrowthRate("IBM", 20, "n");
  //getDivByYear("IBM", 4);
  //getDivGrowthRate("IBM", 4);
  //yearsAgo.setFullYear(yearsAgo.getFullYear() - 1);
  //return getDivFromTo("PDI", yearsAgo, currentTime);
}
