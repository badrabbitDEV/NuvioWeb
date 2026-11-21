package tv.nuvio.webhost

import android.os.Bundle
import android.view.Gravity
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import `is`.xyz.mpv.MPV
import `is`.xyz.mpv.Utils
import java.io.File
import java.util.concurrent.Executors

class NativePlayerActivity : AppCompatActivity() {
    private lateinit var sourceUrl: String
    private lateinit var mediaTitle: String
    private lateinit var requestedEngine: String
    private lateinit var root: FrameLayout
    private lateinit var status: TextView
    private var exoPlayer: ExoPlayer? = null
    private var mpv: MPV? = null
    private var mpvSurface: SurfaceView? = null
    private val mpvExecutor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "Nuvio-Web-Libmpv").apply { isDaemon = true }
    }
    private var mpvAttached = false
    private var mpvPaused = false
    private var exoFailed = false
    private var mpvFailed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sourceUrl = intent.getStringExtra(EXTRA_URL) ?: run { finish(); return }
        mediaTitle = intent.getStringExtra(EXTRA_TITLE) ?: "Nuvio"
        requestedEngine = intent.getStringExtra(EXTRA_ENGINE) ?: "auto"
        root = FrameLayout(this).apply { setBackgroundColor(0xFF000000.toInt()) }
        setContentView(root)
        status = TextView(this).apply {
            setTextColor(0xFFFFFFFF.toInt())
            textSize = 14f
            text = "Preparando reprodução…"
            setPadding(24, 12, 24, 12)
            setBackgroundColor(0xAA000000.toInt())
        }
        startEngine(if (requestedEngine == "libmpv") "libmpv" else "exoplayer")
    }

    private fun startEngine(engine: String) {
        status.text = if (engine == "libmpv") "Iniciando libmpv…" else "Iniciando ExoPlayer…"
        if (engine == "libmpv") startLibmpv() else startExoPlayer()
    }

    private fun startExoPlayer() {
        releaseMpv()
        exoPlayer?.release()
        exoPlayer = null
        runCatching {
            val player = ExoPlayer.Builder(this).build()
            exoPlayer = player
            val playerView = PlayerView(this).apply {
                this.player = player
                useController = true
                controllerShowTimeoutMs = 3500
            }
            root.removeAllViews()
            root.addView(playerView, FrameLayout.LayoutParams(-1, -1))
            root.addView(status, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START))
            player.addListener(object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) {
                    if (!exoFailed) {
                        exoFailed = true
                        runOnUiThread {
                            if (!mpvFailed) startEngine("libmpv")
                            else showFailure("ExoPlayer e libmpv não conseguiram abrir esta fonte.")
                        }
                    }
                }
            })
            player.setMediaItem(MediaItem.fromUri(sourceUrl))
            player.prepare()
            player.playWhenReady = true
            status.postDelayed({ status.visibility = View.GONE }, 2500)
        }.onFailure {
            exoFailed = true
            if (!mpvFailed) startEngine("libmpv") else showFailure("Não foi possível iniciar ExoPlayer nem libmpv.")
        }
    }

    private fun startLibmpv() {
        exoPlayer?.release()
        exoPlayer = null
        runCatching {
            val surface = SurfaceView(this)
            mpvSurface = surface
            root.removeAllViews()
            root.addView(surface, FrameLayout.LayoutParams(-1, -1))
            val controls = buildMpvControls()
            root.addView(controls, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
            root.addView(status, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START))
            // Match the upstream Nuvio Android initialization path: copy bundled assets
            // before constructing libmpv so fonts, certificates, and runtime resources exist.
            Utils.copyAssets(this)
            val player = MPV(this)
            mpv = player
            val configDir = File(cacheDir, "nuvio-mpv-config").apply { mkdirs() }
            val cacheDir = File(cacheDir, "nuvio-mpv-cache").apply { mkdirs() }
            player.setConfigDir(configDir.absolutePath)
            player.setCacheDir(cacheDir.absolutePath)
            player.command("apply-profile", "fast")
            player.setOptionString("vo", "gpu-next")
            player.setOptionString("hwdec", "auto-safe")
            player.setOptionString("force-window", "no")
            player.setOptionString("tls-verify", "yes")
            player.setOptionString("idle", "once")
            player.setOptionString("keep-open", "yes")
            player.setOptionString("input-default-bindings", "yes")
            surface.holder.addCallback(object : SurfaceHolder.Callback {
                override fun surfaceCreated(holder: SurfaceHolder) {
                    mpvExecutor.execute {
                        runCatching {
                            player.attachSurface(holder.surface)
                            mpvAttached = true
                            player.setOptionString("force-window", "yes")
                            player.setPropertyString("vo", "gpu-next")
                            player.command("loadfile", sourceUrl, "replace")
                        }.onFailure {
                            runOnUiThread {
                                mpvFailed = true
                                if (!exoFailed) startEngine("exoplayer") else showFailure("libmpv não conseguiu abrir esta fonte.")
                            }
                        }
                    }
                }
                override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = Unit
                override fun surfaceDestroyed(holder: SurfaceHolder) {
                    mpvExecutor.execute {
                        runCatching { if (mpvAttached) player.detachSurface() }
                        mpvAttached = false
                    }
                }
            })
            status.postDelayed({ status.visibility = View.GONE }, 2500)
        }.onFailure {
            mpvFailed = true
            if (!exoFailed) startEngine("exoplayer") else showFailure("Não foi possível iniciar libmpv nem ExoPlayer.")
        }
    }

    private fun buildMpvControls(): View {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(12, 8, 12, 8)
            setBackgroundColor(0xAA080A10.toInt())
        }
        fun add(label: String, action: () -> Unit) {
            bar.addView(Button(this).apply { text = label; setOnClickListener { action() } })
        }
        add("Voltar") { finish() }
        add("−10s") { runMpvCommand("seek", "-10", "relative") }
        add("Play / pausa") {
            mpvPaused = !mpvPaused
            mpvExecutor.execute { runCatching { mpv?.setPropertyBoolean("pause", mpvPaused) } }
        }
        add("+10s") { runMpvCommand("seek", "10", "relative") }
        add("ExoPlayer") { if (!exoFailed) startEngine("exoplayer") }
        return bar
    }

    private fun runMpvCommand(vararg args: String) {
        mpvExecutor.execute { runCatching { mpv?.command(*args) } }
    }

    private fun showFailure(message: String) {
        MainActivity.notifyNativePlayerFailed()
        status.visibility = View.VISIBLE
        status.text = "$mediaTitle\n$message"
        status.setOnClickListener { finish() }
    }

    private fun releaseMpv() {
        val player = mpv ?: return
        mpv = null
        mpvExecutor.execute {
            runCatching { if (mpvAttached) player.detachSurface() }
            mpvAttached = false
            runCatching { player.close() }
        }
    }

    override fun onPause() {
        super.onPause()
        exoPlayer?.playWhenReady = false
        mpvExecutor.execute { runCatching { mpv?.setPropertyBoolean("pause", true) } }
    }

    override fun onDestroy() {
        exoPlayer?.release()
        exoPlayer = null
        releaseMpv()
        mpvExecutor.shutdown()
        current = null
        super.onDestroy()
        MainActivity.notifyNativePlayerClosed()
    }

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
        const val EXTRA_ENGINE = "engine"
        @Volatile private var current: NativePlayerActivity? = null

        fun closeCurrent() { current?.finish() }
        fun pauseCurrent() {
            current?.let { activity ->
                activity.exoPlayer?.pause()
                activity.mpvExecutor.execute { runCatching { activity.mpv?.setPropertyBoolean("pause", true) } }
            }
        }
        fun resumeCurrent() {
            current?.let { activity ->
                activity.exoPlayer?.play()
                activity.mpvExecutor.execute { runCatching { activity.mpv?.setPropertyBoolean("pause", false) } }
            }
        }
        fun seekCurrent(seconds: Double) {
            if (!seconds.isFinite()) return
            current?.let { activity ->
                val targetMs = (seconds * 1000).toLong().coerceAtLeast(0)
                activity.exoPlayer?.seekTo(targetMs)
                activity.mpvExecutor.execute { runCatching { activity.mpv?.command("seek", seconds.toString(), "absolute") } }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        current = this
    }
}
