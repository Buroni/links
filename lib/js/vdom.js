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
subsByName = {};

function getUniqueID(handler,k) {
  function cont(res) { }
  const variantTag = handler["_label"];
  const evtName = handler["_value"]["1"];
  const genMsgFn = handler["_value"]["2"];

  if (evtName == "keypress") {
    genMsgFn("0", cont);
    var subID = evtName + fNames[fNames.length - 1]
  } else if (variantTag == "VirtualDom.TimeHandler") {
    var subID = "time" + genMsgFn.name; 
  } else {
    var subID = "what else";
  }
  console.log(subID);
  k(subID);
}

function _updateSubscriptions(subs) {
  //console.log(fNames);
  for (var i = 0; i < subs["2"].length; i++) {
    //console.log(Object.keys(subs["2"]));
    var handler = subs["2"][i]["_value"][2];
    const subID = subs["2"][i]["_value"][1];
    const variantTag = handler["_label"];
    const evtName = handler["_value"]["1"];
    const genMsgFn = handler["_value"]["2"];
    if (evtName == "keypress") {
      //console.log(genMsgFn.toString());
    }
    //console.log(i + " " + evtName);
  }
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
      subscriptions.push ( window.setInterval(function() {
          genMsgFn(cont);
        }, evtName));
      if (fNames.indexOf(genMsgFn.name) == -1) fNames.push(genMsgFn.name);
      break;
    case "VirtualDom.StringHandler":
        if (evtName == "mousemove") {
            subscriptions.push ( function(event) {
              genMsgFn({1:event.clientX,2:event.clientY}, cont);
            });
            document.addEventListener("mousemove", subscriptions[subscriptions.length - 1]);
        } else if (evtName == "keypress") {
            subscriptions.push ( function(event) {
              var keycode = event.keyCode.toString();
              genMsgFn(keycode, cont);
              //subsByName[fNames[fNames.length - 1]] = evtName;
            });
            document.addEventListener("keyup", subscriptions[subscriptions.length - 1]);
        } 
        break;
      default:
        console.log("default");
    }
  }
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

