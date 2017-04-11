# multihack-wire

![Travis CI](https://travis-ci.org/RationalCoding/multihack-wire.svg?branch=master)
[![Standard - JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

Multihack's custom streaming wire protocol.

Designed for sending many large files in random chunk sizes, but also lots of tiny edits.

Needs to be paired with something like `stream-throttle` or it will overload a connection.

## protocol

### `request project`

```
<00000000><filepath length><filepath><file length><file content>`
    8b           32b           xb         32b          xb
```

### `provide file`

```
<10000000><filepath length><filepath><file length><file content>`
    8b          32b            xb        32b           xb
```

### `change file`

```
<01000000><filepath length><filepath><payload length><json payload>`
    8b         32b            xb           32b            xb
```

### `delete file`

```
<11000000><filepath length><filepath>`
    8b          32b           xb
```
