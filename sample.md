Chapter 2.2.

Now that everything is set up correctly let’s make the first iteration of our web application. We’ll begin with the three absolute essentials:

-   The first thing we need is a handler. If you’re coming from an MVC-background, you can think of handlers as being a bit like controllers. They’re responsible for executing your application logic and for writing HTTP response headers and bodies.
-   The second component is a router (or servemux in Go terminology). This stores a mapping between the URL patterns for your application and the corresponding handlers. Usually you have one servemux for your application containing all your routes.
-   The last thing we need is a web server. One of the great things about Go is that you can establish a web server and listen for incoming requests _as part of your application itself_. You don’t need an external third-party server like Nginx or Apache.
    

Let’s put these components together in the `main.go` file to make a working application.

File: main.go

```
package main

import (
    "log"
    "net/http"
)

// Define a home handler function which writes a byte slice containing
// "Hello from Snippetbox" as the response body.
func home(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("Hello from Snippetbox"))
}

func main() {
    // Use the http.NewServeMux() function to initialize a new servemux, then
    // register the home function as the handler for the "/" URL pattern.
    mux := http.NewServeMux()
    mux.HandleFunc("/", home)

    // Use the http.ListenAndServe() function to start a new web server. We pass in
    // two parameters: the TCP network address to listen on (in this case ":4000")
    // and the servemux we just created. If http.ListenAndServe() returns an error
    // we use the log.Fatal() function to log the error message and exit. Note
    // that any error returned by http.ListenAndServe() is always non-nil.
    log.Print("Starting server on :4000")
    err := http.ListenAndServe(":4000", mux)
    log.Fatal(err)
}
```

When you run this code, it should start a web server listening on port 4000 of your local machine. Each time the server receives a new HTTP request it will pass the request on to the servemux and — in turn — the servemux will check the URL path and dispatch the request to the matching handler.

Let’s give this a whirl. Save your `main.go` file and then try running it from your terminal using the `go run` command.

```
$ cd $HOME/code/snippetbox
$ go run .
2022/01/29 11:13:26 Starting server on :4000
```

While the server is running, open a web browser and try visiting [`http://localhost:4000`](http://localhost:4000/). If everything has gone to plan you should see a page which looks a bit like this:

![02.02-01.png](https://lets-go.alexedwards.net/sample/assets/img/02.02-01.png)

If you head back to your terminal window, you can stop the server by pressing `Ctrl+c` on your keyboard.

___

### Additional information

#### Network addresses

The TCP network address that you pass to `http.ListenAndServe()` should be in the format `"host:port"`. If you omit the host (like we did with `":4000"`) then the server will listen on all your computer’s available network interfaces. Generally, you only need to specify a host in the address if your computer has multiple network interfaces and you want to listen on just one of them.

In other Go projects or documentation you might sometimes see network addresses written using named ports like `":http"` or `":http-alt"` instead of a number. If you use a named port then Go will attempt to look up the relevant port number from your `/etc/services` file when starting the server, or will return an error if a match can’t be found.

#### Using go run

During development the `go run` command is a convenient way to try out your code. It’s essentially a shortcut that compiles your code, creates an executable binary in your `/tmp` directory, and then runs this binary in one step.

It accepts either a space-separated list of `.go` files, the path to a specific package (where the `.` character represents your current directory), or the full module path. For our application at the moment, the three following commands are all equivalent:

```
$ go run .
$ go run main.go
$ go run snippetbox.alexedwards.net
```