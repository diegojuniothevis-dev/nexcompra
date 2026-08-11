package com.nexcompra.erp;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://diegojuniothevis-dev.github.io/nexcompra/app-apk-cotacao.html?v=535";
    private static final int FILE_CHOOSER_REQUEST = 1401;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState); setContentView(R.layout.activity_main);
        webView=findViewById(R.id.webview); configureWebView();
        if(savedInstanceState==null) webView.loadUrl(APP_URL); else webView.restoreState(savedInstanceState);
    }
    private void configureWebView(){
        WebSettings s=webView.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true); s.setAllowFileAccess(true); s.setAllowContentAccess(true); s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true); s.setTextZoom(100); s.setCacheMode(WebSettings.LOAD_NO_CACHE); s.setBuiltInZoomControls(false); s.setMediaPlaybackRequiresUserGesture(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); s.setJavaScriptCanOpenWindowsAutomatically(true); s.setSupportMultipleWindows(false); s.setUserAgentString(s.getUserAgentString()+" NexCompraAndroid/5.3.5");
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(webView,true); webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        webView.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request){Uri uri=request.getUrl(); if("http".equals(uri.getScheme())||"https".equals(uri.getScheme())){String host=uri.getHost()==null?"":uri.getHost(); if(host.endsWith("github.io")||host.endsWith("supabase.co")) return false;} return openExternally(uri);}});
        webView.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;try{startActivityForResult(params.createIntent(),FILE_CHOOSER_REQUEST);}catch(ActivityNotFoundException e){fileCallback=null;Toast.makeText(MainActivity.this,"Nenhum seletor de arquivos disponível.",Toast.LENGTH_LONG).show();return false;}return true;}});
        webView.setDownloadListener((url,userAgent,contentDisposition,mimeType,contentLength)->{try{DownloadManager.Request r=new DownloadManager.Request(Uri.parse(url));r.setMimeType(mimeType);r.addRequestHeader("User-Agent",userAgent);r.addRequestHeader("Cookie",CookieManager.getInstance().getCookie(url));r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,"NexCompra-"+System.currentTimeMillis());((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(r);Toast.makeText(this,"Download iniciado.",Toast.LENGTH_SHORT).show();}catch(Exception e){openExternally(Uri.parse(url));}});
    }
    private boolean openExternally(Uri uri){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(ActivityNotFoundException e){Toast.makeText(this,"Não foi possível abrir este link.",Toast.LENGTH_SHORT).show();}return true;}
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode==FILE_CHOOSER_REQUEST&&fileCallback!=null){fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data));fileCallback=null;}}
    @Override public void onBackPressed(){if(webView.canGoBack())webView.goBack();else super.onBackPressed();}
    @Override protected void onSaveInstanceState(Bundle outState){webView.saveState(outState);super.onSaveInstanceState(outState);}
    @Override protected void onDestroy(){if(webView!=null)webView.destroy();super.onDestroy();}
}
