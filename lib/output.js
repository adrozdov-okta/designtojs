
function Output(tokens){
    this.consumed = 0;
    this.tokens = tokens;
    this.string = '';
    this.indent = '';
}

Output.prototype.find = function(what, start, options){
    options = options || {};
    var skip = options.skip;
    var stack = options.stack;
    var dir = options.dir || 1;
    var stacked = 0;
    var tokens = this.tokens;
    while(start >= 0 && start < tokens.length){
        var token = tokens[start];
        var type = token[0];

        if(what.indexOf(type) !== -1){
            if(stacked > 0){
                stacked--; 
            } else {
                return start;
            }
        } else if(type === stack){
            stacked++;
        } else if(typeof skip !== 'undefined' && skip.indexOf(type) === -1) {
            return -1;
        }

        start += dir;
    }
    return -1;
};

Output.prototype.capturePart = function(start){
    var tokens = this.tokens;
    var end = start;
    var next;
    var wasWord = false;
    while(end < tokens.length){
        if(wasWord){
            next = this.find(['dot', 'start_access', 'start_head'], end, {
                skip: ['space', 'comment']
            });
            wasWord = false;
        } else {
            next = this.find(['word', 'literal', 'start_head'], end, {
                skip: ['space', 'comment']
            });
            wasWord = true;
        }
        if(next === -1){
            break;
        }
        var token = tokens[next];
        var toFind;
        if(token[0] === 'start_access'){
            toFind = 'end_access';
        } else if(token[0] === 'start_head'){
            toFind = 'end_head';
            wasWord = true;
        }
        if(toFind){
            end = this.find([toFind], next+1, {
                stack: token[0]
            });
            if(end === -1){
                break;
            }
        }
        end = next + 1; //always exclusive index
    }
    return [start, end];
};

Output.prototype.captureExpression = function(start){
    var tokens = this.tokens;
    var first = this.find(['word', 'literal', 'function', 'start_head'], start);
    var firstToken = tokens[first];
    if(firstToken[0] === 'function'){
        var head_start = this.find(['start_head'], first+1, {
            skip: ['space', 'comment']
        });
        if(head_start === -1) return [start, start];
        var head_end = this.find(['end_head'], head_start+1, {
            stack: 'start_head'
        });
        if(head_end === -1) return [start, start];
        var body_start = this.find(['start_body'], head_end+1, {
            skip: ['space', 'comment']
        });
        if(body_start === -1) return [start, start];
        var body_end = this.find(['end_body'], body_start+1, {
            stack: 'start_body',
        });
        if(body_end === -1) return [start, start];
        return [start, body_end+1];
    }
    return [start, this.capturePart(first)[1]];
};

Output.prototype.insert = function(start, insert){
    if(start <= this.consumed){
        this.consumed += insert.length;
    }
    var args = [start, 0];
    args.push.apply(args, insert);
    this.tokens.splice.apply(this.tokens, args);
};

Output.prototype.remove = function(start, end){
    var length = end - start;
    if(start < this.consumed){
        if(end < this.consumed){ 
            this.consumed -= length;
        } else {
            this.consumed = start;
        }
    }
    return this.tokens.splice(start, length);
};

Output.prototype.compile = function(){
    var tokens = this.tokens;
    this.consumed = 0;
    this.string = '';
    var token;
    var type;
    //Extend all heads
    while(this.consumed<tokens.length){
        token = tokens[this.consumed];
        type = token[0];
        if(type === 'start_head'){
            this.extendHead();
        }
        this.consumed++;
    }
    
    this.consumed = 0;
    //Infuse the callbacks!!!!!!
    while(this.consumed<tokens.length){
        token = tokens[this.consumed];
        type = token[0];
        if(type === 'callback'){
            this.compileCallback();
        } else if(type === 'colon'){
            this.compileColon();
        }
        this.consumed++;
    }

    for(var i=0; i<tokens.length; i++){
        this.string += this.print(tokens[i]);
    }
    return this.string;
};

var printLookup = {
    'start_head': '(',
    'end_head': ')',
    'start_body': '{',
    'end_body': '}',
    'start_access': '[',
    'end_access': ']',
    'colon': ':',
    'comma': ',',
    'terminator': ';',
    'asterix': '*',
    'function': 'function',
    'dot': '.',
};

Output.prototype.print = function(token){
    var type = token[0];

    if(type === 'word' || type === 'space' || type === 'comment' || type === 'comparator' || type === 'operator' || type === 'literal' || type === 'assignment'){
        return token[1];
    }
    var lookup = printLookup[type];
    if(lookup){
        return lookup;
    }
    return "UNKNOWN# "+JSON.stringify(token);
};

Output.prototype.compileColon = function(){
    this.remove(this.consumed, this.consumed+1);

    var previousWord = this.find(['word'], this.consumed-1, {
        skip: ['space', 'comment']  
    });

    if(previousWord === -1) return;

    var previousDot = this.find(['dot'], previousWord-1, {
        skip: ['space', 'comment']  
    });

    if(previousDot !== -1){
        //Add this to the prototype
        this.insert(previousDot+1, [
            ['word', 'prototype'],
            ['dot'],
        ]);
        
        this.insert(this.consumed, [
            ['space', ' '],
            ['assignment', '='],
            ['space', ' ']
        ]);
    } else {
        //This is the constructor, move the word after 'function'
        var fnStart = this.find(['function'], this.consumed, {
            skip: ['space', 'comment']  
        });
        if(fnStart === -1) return;
        
        var fnSpace = this.find(['space'], fnStart+1, {
            skip: []  
        });
        if(fnSpace === -1){
            this.insert(fnStart+1, [
                ['space', ' '],
            ]);
            fnSpace = fnStart + 1;
        }

        this.insert(fnSpace+1, [
            this.tokens[previousWord] 
        ]);

        this.remove(previousWord, 1);

    }

};

Output.prototype.compileCallback = function(){
    this.remove(this.consumed, this.consumed+1);

    var headEnd = this.find(['end_head'], this.consumed-1, {
        dir: -1,
        skip : ['space', 'comment'],
    });
    if(headEnd === -1) return;

    var boundary = this.captureExpression(this.consumed);
    
    var headPreviousArg = false;

    for(var i=headEnd; i>=0; i--){
        var token = this.tokens[i];
        var type = token[0];
        if(type === 'start_head') break;
        if(type !== 'space' && type !== 'comment'){
            headPreviousArg = true;
            break;
        }
    }

    var expression = this.remove(boundary[0], boundary[1]);
    if(headPreviousArg){
        expression.unshift(['comma']);
    }

    this.insert(headEnd, expression);

    this.consumed = headEnd;
};

Output.prototype.compileOptionalArgs = function(args){
    var checks = [];
    for(var i=0; i<args.length; i++){
        var arg = args[i];
        if(arg.length !== 2) continue;
        var word = arg[0];
        if(word[0] !== 'word') continue;
        var second = arg[1];
        if(second[0] !== 'operator' || second[1] !== '?') continue; 
        arg.splice(1, 1);  //Remove the ?
        break;
    }
    if(i<args.length){
        var last = args[args.length-1];
        if(last.length !== 1) return [];
        if(last[0][0] !== 'word') return [];

        var changes = [];
        var previous;
        for(var i2=i; i2<args.length; i2++){
            var current = args[i2];
            if(current.length !== 1) return [];
            if(current[0][0] !== 'word') return [];
            if(previous){
                changes.push([
                    current[0],
                    ['assignment', '='],
                    previous[0] ,
                    ['terminator']
                ]);
            } else {
                changes.push([
                    current[0],
                    ['assignment', '='],
                    ['word', 'undefined'],
                    ['terminator']
                ]);
            }
            previous = current;
        }

        checks.push(
            ['word', 'if'],
            ['start_head'],
            last[0],
            ['comparator', '==='],
            ['word', 'null'],
            ['comparator', '||'],
            ['word', 'typeof'],
            ['space', ' '],
            last[0],
            ['comparator', '==='],
            ['literal', "'undefined'", 'string'],
            ['end_head'],
            ['start_body']
        );

        for(var i3=changes.length-1; i3>=0; i3--){
            checks.push.apply(checks,changes[i3]);
        }

        checks.push(['end_body']);
    }
    return checks;
};

Output.prototype.compileArg = function(arg){
    for(var i=0; i<arg.length; i++){
        var part = arg[i];
        var ptype = part[0];
        if(ptype === 'comment' || ptype === 'space'){
            arg.splice(i, 1);
            i--;
        }
    }
    if(arg.length < 2){
        return [];
    }

    var p1 = arg[0];
    var p1t = p1[0];
    var p2 = arg[1];
    var p2t = p2[0];
        
    var right = arg.slice(2);
    
    if(p1t !== 'word') return [];

    var check = [];

    if(p2t === 'colon'){
        //Using a default value
        check.push(
            ['word', 'if'],
            ['start_head'],
            p1,
            ['comparator', '==='],
            ['word', 'null'],
            ['comparator', '||'],
            ['word', 'typeof'],
            ['space', ' '],
            p1,
            ['comparator', '==='],
            ['literal', "'undefined'", 'string'],
            ['end_head'],
            ['start_body'],
            p1,
            ['assignment', '=']
        ); 
        check.push.apply(check, right);
        check.push(['end_body']);
        arg.splice(1, arg.length - 1);
    } else if (p2t === 'operator'){
        var otype = p2[1];
        if(otype === '!'){
            //passing on errors
            check.push(
                ['word', 'if'],
                ['start_head'],
                p1,
                ['comparator', '!=='],
                ['word', 'null'],
                ['comparator', '&&'],
                ['word', 'typeof'],
                ['space', ' '],
                p1,
                ['comparator', '!=='],
                ['literal', "'undefined'", 'string'],
                ['end_head'],
                ['start_body'],
                ['word', 'return'],
                ['space', ' ']
            ); 
            check.push.apply(check, right);
            check.push(
                    ['start_head'],
                    p1, 
                    ['end_head'],
                    ['end_body']
            );
            arg.splice(1, arg.length - 1);
        }

        //NOT YET IMPLEMENTED ? optional parameter
    }

    return check;
};

Output.prototype.extendHead = function(){
    //First we gotta check if this is a function head

    var funcstart = this.find(['callback', 'colon', 'function'], this.consumed-1, {
        dir: -1,
        skip : ['space', 'word'],
    });

    if(funcstart === -1) return; //This is not function head

    var startType = this.tokens[funcstart][0]; 

    if(startType !== 'function'){
        this.insert(funcstart + 1, [['function']]);
    }

    var headEnd = this.find(['end_head'], this.consumed+1, {
        stack: 'start_head'
    });

    if(headEnd === -1) return;
    var headChecks = this.compileHead(this.consumed+1, headEnd);
    
    headEnd = this.find(['end_head'], this.consumed+1, {
        stack: 'start_head'
    });
    
    var bodyPos = this.insertBody(headEnd + 1);
    var bodyStart = bodyPos[0];

    this.insert(bodyStart + 1, headChecks);
};

Output.prototype.compileHead = function(head_first, head_last){
    var head = this.remove(head_first, head_last);
    var headArgs = [];
    var checks = [];
    for(var i=0; i<head.length;){
        var part = head[i];
        if(part[0] === 'comma'){
            headArgs.push(head.slice(0, i));
            head = head.slice(i+1);
            i = 0;
        } else {
            i++;
        }
    }
    if(head.length > 0){
        headArgs.push(head);
    }
    for(var i2=0; i2<headArgs.length; i2++){
        checks.push.apply(checks, this.compileArg(headArgs[i2]));
    }

    checks.push.apply(checks, this.compileOptionalArgs(headArgs));
    
    head = [];
    for(var i3=0; i3<headArgs.length; i3++){
        head.push.apply(head, headArgs[i3]);
        if(i3 < headArgs.length-1){
            head.push(['comma'], ['space', ' ']);
        }
    }

    this.insert(head_first, head);

    return checks;
};


Output.prototype.insertBody = function(start){
    var contentStart = start;
    var startType, startToken;
    for(;contentStart < this.tokens.length; contentStart++){
        startToken = this.tokens[contentStart];
        startType = startToken[0];
        if(startType === 'start_body' || (startType !== 'comment' && startType !== 'space')){
            break;
        }
    }

    var contentEnd = this.find(['end_body'], start+1, {
        stack: 'start_body'
    });

    //Insert the body
    if(startType !== 'start_body'){
        this.insert(start, [['start_body']]);
        if(contentEnd === -1){
            this.tokens.push(['end_body']);
        } else {
            contentEnd++;
            this.insert(contentEnd, [['end_body']]);
        }
    } else {
        start = contentStart;
    }
    
    return [start, contentEnd];
};
module.exports = Output;