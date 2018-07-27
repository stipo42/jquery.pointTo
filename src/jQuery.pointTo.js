/*
* "Points" to a dom element from the selected source dom element (or elements).
* "Pointing" is defined as an animation that visually leads the user from one element to another.
* The default "pointer" is a highlight of the source element, followed by a small orb generated in the highlight color at the source element
*  which then translates on it's own top and left toward the destination element until it reaches it.
* The purpose of this plugin is to lead the user to a new area of your site that might not necessarily be obvious 
*  or could be an exception to the otherwise natural flow of your site.
*
* This plugin relies HEAVILY on CSS3 and HTML5 and is highly unlikely to work in non-compatible browsers
*
* @author Damon McKernan (stipo42)
* @url https://github.com/stipo42/jquery.pointTo
* @created 2018-07-25
*/
/**
 * Points from the set of source elements to the target destination element defined in 'o'
 * @param [o] {string|object} A map of options or a jQuery selector String of the element to point at.
 * @param [o.target] {string} A jQuery selector String of the element to point at.
 * @param [o.color='yellow'] {string} A CSS color value to use for all colored elements of pointing. Can be overridden.
 * @param [o.opacity=0.5] {number} An opacity value to use for animations and transitions.
 * @param [o.highlightAnimationClass='point-to-highlight'] {string} A class name to use for displaying the highlight 'flash' on elements.
 * @param [o.highlightAnimationDuration=1000] {number} The 'flash' speed when an element is highlighted, in milliseconds. Set to 0 to disable the highlight.
 * @param [o.highlightAnimationColor] {string} A CSS color value for the element highlights, overrides o.color
 * @param [o.pointerClass='point-to-pointer'] {string} A class name to use for the pointer orb.
 * @param [o.pointerTransitionDuration=500] {number} The 'fly' speed of the pointer orb that is drawn between the source and destination elements, in milliseconds. Set to 0 to disable the orb.
 * @param [o.pointerColor] {string} A CSS color value for the pointer orb. Overrides o.color
 * @param [o.pointerSize=25] {number} A value in pixels to use for the diameter of the orb.
 */
$.fn.pointTo = function (o) {
    //region helper functions
    var EMPTY = "";
    var UNDER = "_";

    /**
     * Determines which event to use for animation listening.
     * @return {string} The name of the event to bind animation-end listeners to.
     * */
    function whichAnimationEvent() {
        var t,
            el = document.createElement("fakeelement");

        var animations = {
            "animation": "animationend",
            "OAnimation": "oAnimationEnd",
            "MozAnimation": "animationend",
            "WebkitAnimation": "webkitAnimationEnd"
        };

        for (t in animations) {
            if (el.style[t] !== undefined) {
                return animations[t];
            }
        }
        return EMPTY;
    }

    /**
     * Determines which event to use for transition listening.
     * @return {string} The name of the event to bind transition-end listeners to.
     * */
    function whichTransitionEvent() {
        var t,
            el = document.createElement("fakeelement");

        var transitions = {
            "transition": "transitionend",
            "OTransition": "oTransitionEnd",
            "MozTransition": "transitionend",
            "WebkitTransition": "webkitTransitionEnd"
        };

        for (t in transitions) {
            if (el.style[t] !== undefined) {
                return transitions[t];
            }
        }
        return EMPTY;
    }

    /**
     * Returns the middle point of an element, that is, it's width / 2, and height / 2.
     * @param $elm {jQuery} A jQuery object containing exactly one element.
     * @return {object} An object containing two values, x and y.
     * */
    function getMiddlePoint($elm) {
        var x = $elm.offset().left;
        x += ($elm.outerWidth() / 2);

        x = Math.round(x);
        var y = $elm.offset().top;
        y += ($elm.outerHeight() / 2);
        y = Math.round(y);
        return {x: x, y: y};
    }

    /**
     * Converts a color string to an object with individual red green and blue values.
     * @param colorString {string} A CSS color string.
     * @return {object} an Object with red,green,blue values representing the color supplied, or a rgb object representing yellow.
     * */
    function convertColorToRGB(colorString) {
        var color = colorString.toString();
        var probe = $('#color_probe');
        if (probe.length === 0) {
            probe = $("<div id='color_probe' style='display:none;color:transparent'/>");
            $(document.body).append(probe);
        }
        try {
            probe.css('color', color);
        } catch (e) {
            //IE throws an error instead of defaulting the style to some color or transparent when the value is unrecognized
            return {red: 255, green: 255, blue: 0}
        }
        var computed = getComputedStyle(probe[0])['color']; // Returned as either rgb(x,x,x) or rgba(x,x,x,x)
        var splitComputer = computed.split(",");
        var rawRed = splitComputer[0].split("(")[1];
        var rawGreen = splitComputer[1];
        var rawBlue = splitComputer[2].split(")")[0];
        return {red: rawRed, green: rawGreen, blue: rawBlue}
    }

    /**
     * Creates a CSS color string to represent the given color and opacity.
     * @param rgb {object} An object with red green and blue properties.
     * @param opacity {number} An opacity value
     * @return {string} A CSS rgba color string.
     * */
    function createCSSFromRGBObject(rgb, opacity) {
        return "rgba(" + rgb.red + "," + rgb.green + "," + rgb.blue + "," + opacity + ")";
    }

    /**
     * Creates a CSS identity for the supplied HTML element.
     * @param htmlElement {Element} An HTML element.
     * @return {string} The CSS identity for this element.
     * */
    function getNodeIdentity(htmlElement) {
        var identity = htmlElement.nodeName;
        if (identity === "#document") {
            return EMPTY;
        }
        if (htmlElement.id != null && htmlElement.id !== EMPTY) {
            identity += "#" + htmlElement.id;
        } else if (htmlElement.className != null && htmlElement.className !== EMPTY) {
            identity += "."+htmlElement.className.split(" ").join(".");
        }
        return identity;
    }

    /**
     * Builds a path that can be used to uniquely identify the supplied element in CSS
     * @param $elm {jQuery} A jQuery object that contains exactly one element.
     * @return {string} A CSS ruleset path for uniquely identifying the {@ref $elm}
     * */
    function buildCssPath($elm) {
        var curnode = $elm[0];
        var path = getNodeIdentity(curnode);
        while ($(curnode).parent().length > 0) {
            curnode = $(curnode).parent()[0];
            var ident = getNodeIdentity(curnode);
            if (ident !== EMPTY) {
                path = ident + " > " + path;
            }
        }
        return path.trim();
    }

    /**
     * Creates a style tag and appends it to the {@ref $orig} element.
     * @param $orig {jQuery} The origin element
     * @param $target {jQuery} The target element
     * @param options {object} An object containing the options setup for this pointer instance.
     * @param options.color {object} An RGB object to use for all colored elements of pointing. Can be overridden.
     * @param options.opacity {number} An opacity value to use for animations and transitions.
     * @param options.highlightAnimationClass {string} A class name to use for displaying the highlight 'flash' on elements.
     * @param options.highlightAnimationDuration {number} The 'flash' speed when an element is highlighted, in milliseconds. Set to 0 to disable the highlight.
     * @param options.highlightAnimationColor {object} An RGB object for the element highlights, overrides o.color
     * @param options.pointerClass {string} A class name to use for the pointer orb.
     * @param options.pointerTransitionDuration {number} The 'fly' speed of the pointer orb that is drawn between the source and destination elements, in milliseconds. Set to 0 to disable the orb.
     * @param options.pointerColor {object} An RGB object for the pointer orb. Overrides options.color
     * @param options.pointerSize {number} A value in pixels to use for the diameter of the orb.
     * */
    function makeStyleForAnimation($orig, $target, options) {

        var pSel = buildCssPath($orig);
        var pSel2 = buildCssPath($target);
        var kSel = pSel.toLowerCase().split(" ").join(UNDER).split(">").join(UNDER).split("#").join(UNDER).split(".").join(UNDER);
        var style = $("<style type='text/css'/>");
        var cssText =
            pSel + "." + options.highlightAnimationClass + "," + pSel2 + "." + options.highlightAnimationClass + "{" + "\n" +
            "   animation: " + kSel + "_" + options.highlightAnimationClass + " " + options.highlightAnimationDuration + "ms ease-in-out" + "\n" +
            "}" + "\n" +
            "@keyframes " + kSel + "_" + options.highlightAnimationClass + "{" + "\n" +
            "   0%{" + "\n" +
            "       background-color:initial;" + "\n" +
            "   }" + "\n" +
            "   50%{" + "\n" +
            "       background-color:" + createCSSFromRGBObject((options.highlightAnimationColor || options.color), options.opacity) + ";" + "\n" +
            "   }" + "\n" +
            "   100%{" + "\n" +
            "       background-color:initial;" + "\n" +
            "   }" + "\n" +
            "}" + "\n" +
            "." + kSel + "_" + options.pointerClass + "{" + "\n" +
            "   display:inline-block;" + "\n" +
            "   position:absolute;" + "\n" +
            "   z-index:9999;" + "\n" +
            "   transition:top " + options.pointerTransitionDuration + "ms ease-in-out,left " + options.pointerTransitionDuration + "ms ease-in-out;" + "\n" +
            "}" + "\n" +
            "." + kSel + "_" + options.pointerClass + ":before{" + "\n" +
            "   content:' ';" + "\n" +
            "   position:absolute;" + "\n" +
            "   top:-" + Math.round(options.pointerSize / 2) + "px;" + "\n" +
            "   left:-" + Math.round(options.pointerSize / 2) + "px;" + "\n" +
            "   display:inline-block;" + "\n" +
            "   background-color:" + createCSSFromRGBObject((options.pointerColor || options.color), options.opacity) + ";" + "\n" +
            "   width:" + options.pointerSize + "px;" + "\n" +
            "   height:" + options.pointerSize + "px;" + "\n" +
            "   border-radius:" + options.pointerSize + "px;" + "\n" +
            "}";
        style.text(cssText);
        $orig.append(style);
        return kSel;
    }

    /**
     * @param $orig {jQuery} The origin element
     * @param $target {jQuery} The target element
     * @param options {object} An object containing the options setup for this pointer instance.
     * @param options.color {object} An RGB object to use for all colored elements of pointing. Can be overridden.
     * @param options.opacity {number} An opacity value to use for animations and transitions.
     * @param options.highlightAnimationClass {string} A class name to use for displaying the highlight 'flash' on elements.
     * @param options.highlightAnimationDuration {number} The 'flash' speed when an element is highlighted, in milliseconds. Set to 0 to disable the highlight.
     * @param options.highlightAnimationColor {object} An RGB object for the element highlights, overrides o.color
     * @param options.pointerClass {string} A class name to use for the pointer orb.
     * @param options.pointerTransitionDuration {number} The 'fly' speed of the pointer orb that is drawn between the source and destination elements, in milliseconds. Set to 0 to disable the orb.
     * @param options.pointerColor {object} An RGB object for the pointer orb. Overrides options.color
     * @param options.pointerSize {number} A value in pixels to use for the diameter of the orb.
     */
    function doPoint($orig, $target, options) {
        var kSel = makeStyleForAnimation($orig, $target, options);

        var data = Object.assign({}, options, {
            $orig: $orig,
            pointerClass: kSel + "_" + options.pointerClass,
            $target: $target
        });

        $target.one(
            data.animationEvent,
            function () {
                data.$target.removeClass(data.highlightAnimationClass);
                if(data.debug !== true){
                    $orig.find("style").remove();
                }
            }
        );

        $orig.one(
            data.animationEvent,
            function () {
                data.$orig.removeClass(data.highlightAnimationClass);
                // Create pointer
                data.$pointer = $("<span class='" + data.pointerClass + "'/>");
                var origin = getMiddlePoint(data.$orig);
                data.$pointer.css({
                    left: origin.x,
                    top: origin.y
                });

                // Append pointer
                $(document.body).append(data.$pointer);

                // Attach pointer event
                data.$pointer.one(
                    data.transitionEvent,
                    function () {
                        // Second highlight
                        data.$target.addClass(data.highlightAnimationClass);
                        data.$pointer.remove();
                    }
                );
                // Need to wait a tick for transition to take effect.
                setTimeout(function (data) {
                    var destination = getMiddlePoint(data.$target);
                    data.$pointer.css({
                        left: destination.x,
                        top: destination.y
                    });
                }, 5, data);
            }
        );

        // Start the chain of events.
        $orig.addClass(data.highlightAnimationClass);
    }

    /**
     * Parses out an options object for a given pointer source, reads from defaults and data attributes where applicable.
     * @param self {Element} The selected element
     * @param o {string|object} The supplied options to the plugin
     * @param defaults {object} The default options for the plugin.
     * @return {object} The parsed options object.
     * */
    function parseOptions(self, o, defaults) {
        var options = Object.assign({}, defaults);
        if (typeof options.target !== 'string') {
            options = Object.assign({}, options, o);
        }

        // Look for data attributes
        for (var op in defaults) {
            if (defaults.hasOwnProperty(op)) {
                var datavalue = $(self).data("point-to-" + op);
                if (datavalue != null && datavalue !== EMPTY) {
                    options[op] = datavalue;
                }
            }
        }


        // Convert colors
        if (typeof options.color === "string") {
            options.color = convertColorToRGB(options.color);
        }
        if (typeof options.highlightAnimationColor === "string") {
            options.highlightAnimationColor = convertColorToRGB(options.highlightAnimationColor);
        }
        if (typeof options.pointerColor === "string") {
            options.pointerColor = convertColorToRGB(options.pointerColor);
        }

        return options;
    }

    //endregion

    var defaults = {
        target: o,
        color: "yellow",
        opacity: 0.75,
        highlightAnimationClass: "point-to-highlight",
        highlightAnimationDuration: 500,
        highlightAnimationColor: null,
        pointerClass: "point-to-pointer",
        pointerTransitionDuration: 1000,
        pointerColor: null,
        pointerSize: 25,
        transitionEvent: whichTransitionEvent(),
        animationEvent: whichAnimationEvent(),
        debug:false
    };

    if (this.length > 0) {
        for (var i = 0; i < this.length; i++) {
            var self = this[i];
            var options = parseOptions(self, o, defaults);
            var $orig = $(this[i]);
            var $target = $(options.target);
            if ($target.length === 0) {
                console.error("No target supplied, please supply a target");
            } else {
                doPoint($orig, $target, options);
            }
        }
    }
};
