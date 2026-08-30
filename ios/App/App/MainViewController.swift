import Capacitor

// Disables the pinch-to-zoom gesture on the WKWebView so the native app
// behaves like a fixed-layout app rather than a zoomable web page — the
// viewport meta tag's user-scalable=no isn't always honoured for the
// pinch gesture inside a WKWebView, so it's disabled natively too.
class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.scrollView.pinchGestureRecognizer?.isEnabled = false
    }
}
