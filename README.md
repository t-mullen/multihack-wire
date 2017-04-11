# multihack-wire
The streaming wire protocol for Multihack.

Designed for sending both large sequential files in random chunk sizes (for the fetch code feature), and also lots of tiny edits.

Needs to be paired with something like `stream-throttle` or it will overload a connection.
