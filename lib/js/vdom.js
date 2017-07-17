/////// STUFF FOR VIRTUAL DOM INTEGRATION
// Assumes virtual-dom.js has been loaded.

// Our current ****virtual-dom style**** representation of the VDom.
// Note that this isn't the Links representation -- you'll have to perform
// some processing to get it into virtual-dom form.
var currentVDom = undefined;
var rootNode = undefined;
var h = virtualDom.h;
var diff = virtualDom.diff;
var patch = virtualDom.patch;
var createElement = virtualDom.create;
var evtHandlerPid = undefined;
var inputText = "";
var currentSubID = 0;
var subscriptions = {};
var keyboardEvents = ["oninput", "onkeyup", "onkeydown", "onkeypress"];
var focusEvents = ["onfocus"];
fNames = [];
subEvents = {};

function getUniqueID(handler,k) {
  const variantTag = handler["_label"];
  const evtName = handler["_value"]["1"];
  const genMsgFn = handler["_value"]["2"];

  if (evtName == "keypress") {
    var subID = evtName + genMsgFn.name;
  } else if (variantTag == "VirtualDom.TimeHandler") {
    var subID = "time" + genMsgFn.name; 
  } else if (variantTag == "VirtualDom.TupleIntHandler") {
    var subID = "mousepos" + genMsgFn.name;
  }
  k(subID);
}

function setupSubscription(subscription) {
  if (subscription === undefined || subscription["_value"] === undefined) { return; }
  function cont(res) {
    _Send(evtHandlerPid, res);
  }

  const subID = subscription["_value"]["1"];
  const evtName = subscription["_value"]["2"]["_value"]["1"];
  const genMsgFn = subscription["_value"]["2"]["_value"]["2"];
  const variantTag = subscription["_value"]["2"]["_label"];


  switch(variantTag) {
    case "VirtualDom.TimeHandler":
      subEvents[subID] = window.setInterval(function() {
          genMsgFn(cont);
        }, evtName);
      if (fNames.indexOf(genMsgFn.name) == -1) fNames.push(genMsgFn.name);
      break;
    case "VirtualDom.StringHandler": 
        if (evtName == "keypress") {
            subEvents[subID] = function(event) {
              var keycode = event.keyCode.toString();
              genMsgFn(keycode, cont);
            };
            document.addEventListener("keyup", subEvents[subID]);
        } 
        break;
    case "VirtualDom.TupleIntHandler":
        if (evtName == "mousemove") {
            subEvents[subID] = function(event) {
              genMsgFn({1:event.clientX,2:event.clientY}, cont);
            };
            document.addEventListener("mousemove", subEvents[subID]);
        }
      default:
        console.log("default");
    }
}

function removeSubscription(subscription) {
  if (subscription === undefined || subscription["_value"] === undefined) { return; }

  const subID = subscription["_value"]["1"];
  const evtName = subscription["_value"]["2"]["_value"]["1"];
  const variantTag = subscription["_value"]["2"]["_label"];

  switch(variantTag) {
    case "VirtualDom.TimeHandler":
      window.clearInterval(subEvents[subID]);
      break;
    case "VirtualDom.StringHandler":
        if (evtName == "mousemove") {
            document.removeEventListener("mousemove", subEvents[subID]);
        } else if (evtName == "keypress") {
            document.removeEventListener("keyup", subEvents[subID]);
        } 
        break;
      default:
        console.log("default");
    }
}

function subKeyArray(subs) {
  var keyArr = [];
  for (var i = 0; i < subs.length; i++) {
    keyArr.push(subs[i]["_value"][1]);
  }
  return keyArr;
}

// returns [[a],[b]] where [a] is the list of subs in previous but not new,
// [b] is the list of subs in new but not previous.
function deadBornSubs(oldSubs, newSubs) {
  oldSubsKeys = subKeyArray(oldSubs);
  newSubsKeys = subKeyArray(newSubs);
  // console.log(oldSubsKeys);
  // console.log(newSubsKeys);

  function getDeadSubs() {
    var deadSubs = [];
    for (var i = 0; i < oldSubs.length; i++) {
      if (newSubsKeys.indexOf(oldSubs[i]["_value"][1]) == -1) {
        deadSubs.push(oldSubs[i]);
      }
    }
    return deadSubs;
  }
  function getBornSubs() {
    var bornSubs = [];
    for (var i = 0; i < newSubs.length; i++) {
      if (oldSubsKeys.indexOf(newSubs[i]["_value"][1]) == -1) {
        bornSubs.push(newSubs[i]);
      }
    }
    return bornSubs;
  }
  return [getDeadSubs(), getBornSubs()];
}

function diffSubscriptions(oldSubs, newSubs) {
  deadBorn = deadBornSubs(oldSubs, newSubs);
  deadSubs = deadBorn[0];
  bornSubs = deadBorn[1];

  for (var i = 0; i < bornSubs.length; i++) {
    setupSubscription(bornSubs[i]);
    console.log("Subscribed to " + bornSubs[i]["_value"][1]);
  }

  for (var i = 0; i < deadSubs.length; i++) {
    removeSubscription(deadSubs[i]);
    delete subEvents[deadSubs[i]["_value"][1]];
    console.log("Unsubscribed from " + deadSubs[i]["_value"][1]);
  }
}

function _updateSubscriptions(subs) {
  // console.log(Object.keys(subs[1]));
  // console.log(Object.keys(subs[2]));
  diffSubscriptions(subs[1], subs[2]);
  console.log("Current subscriptions: " + Object.keys(subEvents))
  // console.log(subEvents);
  // console.log("---");
}

function toAttrsArray(attrs) {
  var attrsArr = [];
  for (var i=0; i < attrs.length; i++) {
    _debug(attrs[i]["1"] + " : " + attrs[i]["2"]);
    attrsArr[attrs[i]["1"]] = attrs[i]["2"];
  }
  return attrsArr;
}

// Input: Array of Links variants representing the "shapes" of event
// handlers we can get, along with the name of the event, and callback functions in CPS form to generate a message
// Output: Array of objects of the form { evtName : f }, where f is a direct-style callback which
// produces a message and dispatches it to the event handler process
function setupEvtHandlers(attrs, evtHandlers) {
  if (evtHandlers === undefined) { return; }

  function setupEvtHandler(handler) {
    // I'll do UnitHandler, and leave StringHandler to you...
    //console.log(handler)
    const variantTag = handler["_label"];
    const evtName = handler["_value"]["1"];
    const genMsgFn = handler["_value"]["2"];
    function cont(res) {
      _Send(evtHandlerPid, res);
    }

    if (variantTag == "VirtualDom.UnitHandler") {
      attrs[evtName] = function() { genMsgFn(cont) };
    }
    else if (variantTag == "VirtualDom.StringHandler") {

      if (evtName == "keycode") {
        attrs["onkeyup"] = function(event) {
          var keycode = event.keyCode.toString();
          genMsgFn(keycode, cont);
        };
      }

      else if (keyboardEvents.indexOf(evtName) != -1) {
        if (!attrs["id"]) {
            throw("Element with StringHandler event requires id attribute")
        }
        if (document.getElementById(attrs["id"]) != null) {
          inputText = document.getElementById(attrs["id"]).value;
        }  else {
          inputText = "";
        }
        attrs[evtName] = function() { 
          if (document.getElementById(attrs["id"]) != null) {
            var inputText = document.getElementById(attrs["id"]).value;
          } else {
            var inputText = "";
          }
          genMsgFn(inputText, cont) };
      }
    } else {
      throw("Unsupported event handler form");
    }
  }

  for (let i = 0; i < evtHandlers.length; i++) {
    setupEvtHandler(evtHandlers[i]);
  }
}

function setupSubscriptions() {
  if (subscriptions === undefined) { return; }
 
  for (let i = 0; i < subscriptions.length; i++) {
    setupSubscription(subscriptions[i]);
  }
}

function jsonToVtree(jsonContent) {
  if (jsonContent["_label"] == "VirtualDom.DocTagNode") {
    var treeArr = [];
    var tagContent = jsonContent["_value"];
    var attrs = toAttrsArray(tagContent["attrs"]);
    setupEvtHandlers(attrs, tagContent["eventHandlers"]);
    var children = tagContent["children"];
    for (var i = 0; i < children.length; i++) {
      treeArr.push(jsonToVtree(children[i]));
    }
    return h(tagContent["tagName"], attrs, treeArr);
  }
  if (jsonContent["_label"] == "VirtualDom.DocTextNode") {
    return [String(jsonContent["_value"])];
  }
}

function _runDom(str, doc, pid, subs) {
  subscriptions = subs;
  evtHandlerPid = pid;
  currentVDom = jsonToVtree(doc);
  rootNode = createElement(currentVDom);
  document.getElementById(str).appendChild(rootNode);
  for (var i = 0; i < subs.length; i++) {
    //console.log(subs[i]["_value"]);
    //console.log(fNames);
  }

  setupSubscriptions();
}

function _updateDom(doc) {
  var newTree = jsonToVtree(doc);
  var patches = diff(currentVDom, newTree);
  currentVDom = newTree;
  rootNode = patch(rootNode, patches);
}

// Magic, don't worry about these
var runDom = LINKS.kify(_runDom);
var updateDom = LINKS.kify(_updateDom);
var updateSubscriptions = LINKS.kify(_updateSubscriptions);
// var getUniqueID = LINKS.kify(_getUniqueID);

