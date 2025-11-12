const T_IDENT = 0;
const T_NUMBER = 1;
const T_ARITH_SYMBOL = 2;
const T_LABEL_MAKER = 3;
const T_INSTRUCTION = 4;
const T_DIRECTIVE = 5;
const T_LINENUM = 6;
const T_COMMA = 7;

// type Token = [T_..., string | number ]

const INSTRUCTIONS = [
    "~", "TAKE", "ADD", "SUB", "SAVE", "JMP", "TST", "INC", "DEC", "NULL", "HLT",
];
const INSTRUCTION_ARG_LENGTHS = [
    0,     1,      1,      1,      1,      1,      1,      1,  1,      1,      0,
];

const D_ORG = 0;
const D_TIMES = 1;
const D_DV = 2;
const COMPILER_DIRECTIVES = [
    "ORG", "TIMES", "DV",
];
const DIRECTIVE_ARG_LENGTHS = [
      1,       1,     1,
];

const NUMBERS = "1234567890";
const SYMBOLS = "+-*()";

function isLetter(z) {
    const charCode = z.charCodeAt(0);
    return charCode >= 0x41 && charCode <= 0x5A;
}

function isLetterOrNumber(e) {
    return isLetter(e) || NUMBERS.includes(e);
}


function lexer(inputData) {
    inputData += '\n';
    let cursor = 0;
    function peek() {
        const ch = inputData.charAt(cursor);
        if(ch === '') throw new Error("Unexpected EoF while parsing ASM");
        return ch.toUpperCase();
    }
    function next() {
        const ch = peek();
        cursor++;
        return ch;
    }

    function collectWhile(condition) {
        let output = '';
        for(;;) {
            let nextCh = inputData.charAt(cursor);
            if(condition(nextCh)) {
                output += nextCh;
                cursor++;
            } else {
                return output;
            }
        }
    }

    let lineNumber = 1;
    const outputTokens = [
        [T_LINENUM, lineNumber]
    ];

    while(cursor < inputData.length) {
        const char = next();
        if(char == ' ') continue;
        if(char == '\n') {
            lineNumber++;
            outputTokens.push([T_LINENUM, lineNumber]);
            continue;
        }
        if(NUMBERS.includes(char)) {
            outputTokens.push([T_NUMBER, parseInt(char + collectWhile(e => NUMBERS.includes(e)))]);
        } else if(SYMBOLS.includes(char)) {
            outputTokens.push([T_ARITH_SYMBOL, char]);
        } else if(isLetter(char)) {
            const sequence = char + collectWhile(isLetterOrNumber);
            const instructionIndex = INSTRUCTIONS.indexOf(sequence);
            if(instructionIndex === -1) {
                outputTokens.push([T_IDENT, sequence]);
            } else {
                outputTokens.push([T_INSTRUCTION, instructionIndex])
            }
        } else if(char === ':') {
            outputTokens.push([T_LABEL_MAKER, null]);
        } else if(char === '#') {
            const directive = collectWhile(isLetter);
            const index = COMPILER_DIRECTIVES.indexOf(directive);
            if(index === -1) {
                throw new Error(`No such compiler directive: #${directive} at line ${lineNumber}`);
            } else {
                outputTokens.push([T_DIRECTIVE, index]);
            }
        } else if (char === ',') {
            outputTokens.push([T_COMMA, null]);
        } else if (char == ';') {
            // Comment
            collectWhile(e => e !== '\n');
        } else {
            throw new Error(`Unexpected symbol found while lexing: '${char}' at line ${lineNumber}`);
        }
    }

    return outputTokens;
}

// type Expression = [E_..., content]
const E_LABEL = 0;
const E_INSTRUCTION = 1;
const E_DIRECTIVE = 2;
const E_LINENUM = 3;

function parser(tokenStream) {
    const outputExpressions = [];

    let cursor = 0;
    function expectAnyOf(...types) {
        if(types.includes(tokenStream[cursor][0])) {
            return tokenStream[cursor++];
        } else {
            throw new Error(`Expected token of type ${types}, got ${tokenStream[cursor][0]}`);
        }
    }
    function peekTypeOfNext() {
        return tokenStream[cursor][0];
    }
    function collectCommaSeparated(name, count) {
        let buffer = [];
        let output = [];
        while(peekTypeOfNext() !== T_LINENUM) {
            const token = tokenStream[cursor++];
            if(token[0] == T_COMMA) {
                output.push(buffer);
                buffer = [];
            } else {
                buffer.push(token);
            }
        }
        if(buffer.length)
            output.push(buffer);
        if(count !== output.length) throw new Error(`Invalid number of arguments for ${name} - expected ${count} got ${output.length}`);
        return output;
    }

    let lineNumber = -1;
    try{
        while(cursor < tokenStream.length) {
            const [tokenType, contents] = expectAnyOf(T_DIRECTIVE, T_INSTRUCTION, T_IDENT, T_LINENUM);
            switch(tokenType) {
                case T_LINENUM:
                    lineNumber = contents;
                    outputExpressions.push([E_LINENUM, contents]);
                    break;
                case T_IDENT:
                    expectAnyOf(T_LABEL_MAKER);
                    outputExpressions.push([E_LABEL, contents]);
                    break;
                case T_DIRECTIVE:
                    outputExpressions.push([E_DIRECTIVE, [contents, collectCommaSeparated(`Directive ${COMPILER_DIRECTIVES[contents]}`, DIRECTIVE_ARG_LENGTHS[contents])]]);
                    break;
                case T_INSTRUCTION:
                    outputExpressions.push([E_INSTRUCTION, [contents, collectCommaSeparated(`Instruction ${INSTRUCTIONS[contents]}`, INSTRUCTION_ARG_LENGTHS[contents])]]);
                    break;
                default:
                    throw new Error(`Unexpected token type ${tokenType} as root expression!`);
            }
        }
    }catch(ex) {
        throw new Error(`Error while parsing line ${lineNumber}: ${ex}`);
    }
    return outputExpressions;
}

// Simple 'dud' assembler for the built in instr. set.
function assembleInstruction(instr) {
    return [
        1000 * instr[0], instr[1][0],
    ];
}

function assembler(expressions) {
    const memory = Array(1000).fill(0);
    // type: [index: number, expression: string][]:
    const valuesToRecalculate = [];
    const labels = {};
    let org = 0;
    function emit(number) {
        if(org > memory.length) {
            throw new Error("Emitting outside of memory!");
        }
        console.log(`To ${org} write ${number}`);
        memory[org++] = number;
    }
    function tokenStreamAsNumber(ts) {
        if(ts.length != 1 || ts[0][0] != T_NUMBER) throw new Error(`Token stream ${ts} cannot be expressed as a number!`);
        return ts[0][1];
    }
    let lineNumber = -1;

    function emitExpression(index) {
        const [exprType, contents] = expressions[index];
        switch(exprType) {
            case E_LINENUM:
                lineNumber = contents;
                break;
            case E_DIRECTIVE: {
                const [directiveType, directiveArgs] = contents;
                switch(directiveType) {
                    case D_ORG:
                        org = tokenStreamAsNumber(directiveArgs[0]);
                        break;
                    case D_TIMES:
                        for(let j = 0; j<tokenStreamAsNumber(directiveArgs[0]); j++) {
                            emitExpression(index+1);
                        }
                        return index + 2;
                    case D_DV:
                        valuesToRecalculate.push([org, directiveArgs[0]]);
                        emit(0);
                        break;
                }
                break;
            }
            case E_INSTRUCTION:
                const [base, recalc] = assembleInstruction(contents);
                console.log(`Assembled instruction to base`, base, contents);
                if(recalc)
                    valuesToRecalculate.push([org, recalc]);
                emit(base);
                break;
            case E_LABEL:
                console.log(`Label: ${contents}`);
                labels[contents] = org;
                break;
        }

        return index + 1;
    }

    try{
        for(let i = 0; i<expressions.length; i = emitExpression(i)) {}
    }catch(ex){
        throw new Error(`Error while assembling line ${lineNumber}: ${ex}`);
    }

    for(const [address, value] of valuesToRecalculate) {
        let evaluated;
        with(labels) {
            evaluated = eval(value.map(e => e[1].toString()).join(''));
        }
        console.log(evaluated);
        memory[address] |= evaluated;
    }

    return memory;
}

// For the UI code:
function runAssembly() {
    const textContents = document.getElementById("assemblyCode").value.toUpperCase();
    let memory;
    try{
        memory = assembler(parser(lexer(textContents)));
    }catch(ex) {
        alert(`${ex}`);
        return;
    }
    for(let i = 0; i<memory.length; i++) {
        writeToRam(memory[i], i);
    }
    updateLocalStorageRam();
}
