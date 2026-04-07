import zmq

def run_broker():
    context = zmq.Context()

    xpub = context.socket(zmq.XPUB)
    xpub.bind("tcp://*:5555") # Subscribers connect here
    xsub = context.socket(zmq.XSUB)
    xsub.bind("tcp://*:5556") # Publishers connect here
    print("Broker active. XPUB: 5555, XSUB: 5556.")
    zmq.proxy(xsub, xpub)

if __name__ == "__main__":
    run_broker()