// The streaming binary wire protocol for Multihack
// Why? Because JSON/msgpack/schemapack/protobuf/anything weren't fast enough with chunking.
// For large and/or rapid sequential file transfer over ws/webrtc

var Duplex = require('readable-stream').Duplex
var Buffer = require('safe-buffer').Buffer
var inherits = require('inherits')

inherits(Wire, Duplex)

var MESSAGE_PROTOCOL = Buffer.from('\u0013MultiHack protocol')
var MESSAGE_REQUEST_PROJECT = 0
var MESSAGE_PROVIDE_FILE = 1
var MESSAGE_DELETE_FILE = 2
var MESSAGE_CHANGE_FILE = 3

function Wire (opts) {
  if (!(this instanceof Wire)) return new Wire(opts)

  Duplex.call(this)

  this._sentProtocol = false

  this._buffer = [] // stores incomplete message
  this._bufferSize = 0 // size of above buffer

  // number of bytes the next parsing function is waiting on
  this._parseSize = MESSAGE_PROTOCOL.length
  this._parseState = 0 // just use a state for linear parsing trees
  this._parseObj = {} // the output parsing object

   // the function that will handle parsing (changes)
  this._parse = this._parseProtocol

  this.destroyed = false
  this._finished = false
  this.on('finish', this._onFinish)
}

Wire.prototype.destroy = function () {
  if (this.destroyed) return

  this.destroyed = true
  this._onFinish()
  this.emit('close')
  this.end()

  this._buffer = null
  this._bufferSize = null
  this._parseSize = null
  this._parseState = null
  this._parseObj = null
  this._parse = null
}

/*
<MESSAGE_PROVIDE_FILE>
<filepath length><filepath><file length><file content>
*/
Wire.prototype.provideFile = function (filePath, content) {
  var i = 0
  var size = content.length
  var buf = Buffer.alloc(8 + 32 + filePath.length + 32 + size)

  buf.writeInt8(MESSAGE_PROVIDE_FILE)

  buf.writeInt32LE(filePath.length, i += 8)
  buf.write(filePath, i += 32)

  buf.writeInt32LE(size, i += filePath.length)
  buf.write(content, i += 32)

  this._push(buf)
}

/*
<MESSAGE_DELETE_FILE>
<filepath length><filepath>
*/
Wire.prototype.deleteFile = function (filePath) {
  var i = 0
  var buf = Buffer.alloc(8 + 32 + filePath.length)

  buf.writeInt8(MESSAGE_DELETE_FILE)

  buf.writeInt32LE(filePath.length, i += 8)
  buf.write(filePath, i += 32)

  this._push(buf)
}

/*
<MESSAGE_CHANGE_FILE>
<filepath length><filepath><payload length><json payload>
*/
Wire.prototype.changeFile = function (filePath, change) {
  var i = 0
  var payload = JSON.stringify(change)
  var size = payload.length
  var buf = Buffer.alloc(8 + 32 + filePath.length + 32 + size)

  buf.writeInt8(MESSAGE_CHANGE_FILE)

  buf.writeInt32LE(filePath.length, i += 8)
  buf.write(filePath, i += 32)

  buf.writeInt32LE(size, i += filePath.length)
  buf.write(payload, i += 32)

  this._push(buf)
}

/*
<MESSAGE_REQUEST_PROJECT>
*/
Wire.prototype.requestProject = function (filePath, change) {
  var buf = Buffer.alloc(8)
  buf.writeInt8(MESSAGE_REQUEST_PROJECT)
  this._push(buf)
  // no body
}

Wire.prototype._push = function (chunk) {
  if (this._finished) return
  if (!this._sentProtocol) {
    this.push(MESSAGE_PROTOCOL)
    this._sentProtocol = true
  }
  this.push(chunk)
}

Wire.prototype._read = function () {}

Wire.prototype._write = function (chunk, enc, next) {
  this._bufferSize += chunk.length
  this._buffer.push(chunk)

  // while we have enough bytes
  while (this._bufferSize >= this._parseSize) {
    // save a concat if there's only one sub-buffer
    var buffer
    if (this._buffer.length === 1) {
      buffer = this._buffer[0] // saves a concat
    } else {
      buffer = Buffer.concat(this._buffer)
    }

    this._bufferSize -= this._parseSize // parser ate some bytes

    // calculate remaining buffer
    if (this._bufferSize) { // if there is more buffer
      this._buffer = [buffer.slice(this._parseSize)]
    } else {
      this._buffer = []
    }

    this._parse(buffer.slice(0, this._parseSize)) // parse the data
  }

  next(null) // out of data, get more
}

// initial protocol handshake
Wire.prototype._parseProtocol = function (chunk) {
  if (Buffer.compare(chunk, MESSAGE_PROTOCOL) !== 0) throw new Error('Invalid PROTOCOL')
  this._nextMessage()
}

// parse a message header
Wire.prototype._parseMessage = function (chunk) {
  switch (chunk[0]) {
    case MESSAGE_CHANGE_FILE:
      this._parse = this._parseChangeFile
      this._parseSize = 32
      break
    case MESSAGE_DELETE_FILE:
      this._parse = this._parseDeleteFile
      this._parseSize = 32
      break
    case MESSAGE_PROVIDE_FILE:
      this._parse = this._parseProvideFile
      this._parseSize = 32
      break
    case MESSAGE_REQUEST_PROJECT:
      this.emit('requestProject') // nothing to parse
      this._nextMessage()
      break
  }
}

/*
<MESSAGE_CHANGE_FILE>
<filepath length><filepath><payload length><json payload>
*/
Wire.prototype._parseChangeFile = function (chunk) {
  switch (this._parseState) {
    case 0: // filepath length
      this._parseSize = chunk.readInt32LE(0)
      this._parseState = 1
      break
    case 1: // filepath
      this._parseObj.filePath = chunk.toString()
      this._parseSize = 32
      this._parseState = 2
      break
    case 2: // payload length
      this._parseSize = chunk.readInt32LE(0)
      this._parseState = 3
      break
    case 3: // payload
      // HACK: Why is chunk.toString().length < chunk.length???
      try {
        this._parseObj.change = JSON.parse(chunk.toString())
      } catch (err) {
        this._parseObj.change = JSON.parse(chunk.toString()+'"}')
      }
      this.emit('changeFile', this._parseObj)
      this._nextMessage()
      break
  }
}

/*
<MESSAGE_DELETE_FILE>
<filepath length><filepath>
*/
Wire.prototype._parseDeleteFile = function (chunk) {
  switch (this._parseState) {
    case 0: // filepath length
      this._parseSize = chunk.readInt32LE(0)
      this._parseState = 1
      break
    case 1: // filepath
      this._parseObj.filePath = chunk.toString()
      this.emit('deleteFile', this._parseObj)
      this._nextMessage()
      break
  }
}

/*
<MESSAGE_PROVIDE_FILE>
<filepath length><filepath><file length><file content>
*/
Wire.prototype._parseProvideFile = function (chunk) {
  switch (this._parseState) {
    case 0: // filepath length
      this._parseSize = chunk.readInt32LE(0)
      this._parseState = 1
      break
    case 1: // filepath
      this._parseObj.filePath = chunk.toString()
      this._parseSize = 32
      this._parseState = 2
      break
    case 2: // payload length
      this._parseSize = chunk.readInt32LE(0)
      this._parseState = 3
      break
    case 3: // payload
      this._parseObj.content = chunk.toString()
      this.emit('provideFile', this._parseObj)
      this._nextMessage()
      break
  }
}

// cleans up for next message
Wire.prototype._nextMessage = function () {
  this._parseObj = {}
  this._parseState = 0
  this._parseSize = 8
  this._parse = this._parseMessage
}

Wire.prototype._onFinish = function () {
  this._finished = true

  this.push(null) // prevent new writes
  while (this.read()) {} // consume remaining data
}

module.exports = Wire
