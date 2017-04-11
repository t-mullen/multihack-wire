# multihack-wire
The streaming wire protocol for Multihack.

Designed for sending many large files in random chunk sizes, but also lots of tiny edits.

Needs to be paired with something like `stream-throttle` or it will overload a connection.
