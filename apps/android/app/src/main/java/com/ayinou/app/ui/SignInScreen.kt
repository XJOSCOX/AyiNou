package com.ayinou.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.ayinou.app.BuildConfig
import com.ayinou.app.R
import com.ayinou.app.core.auth.isSignInEmail

internal val SignInNavy = Color(0xFF102C49)

@Composable
internal fun SignInScreen(
    enabled: Boolean,
    busy: Boolean,
    onSubmit: (String, String) -> Unit,
    feedback: @Composable ColumnScope.() -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    Surface(Modifier.fillMaxSize(), color = colors.surface) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            SignInHeader(colors.surface)
            Column(
                modifier = Modifier.widthIn(max = 460.dp).fillMaxWidth().padding(horizontal = 24.dp)
                    .padding(top = 6.dp, bottom = 20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(
                    stringResource(R.string.auth_welcome),
                    modifier = Modifier.semantics { heading() },
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                )
                feedback()
                if (enabled) {
                    SignInForm(busy, onSubmit)
                } else {
                    Notice(stringResource(R.string.auth_disabled), R.drawable.ic_lock)
                }
                AccountHelp()
            }
        }
    }
}

@Composable
private fun SignInHeader(surface: Color) {
    val end = Color(0xFF1D4A71)
    Canvas(Modifier.fillMaxWidth().height(116.dp).clipToBounds()) {
        val w = size.width
        val h = size.height
        drawRect(Brush.verticalGradient(listOf(SignInNavy, end)))

        val wave = Path().apply {
            moveTo(0f, h * 0.74f)
            cubicTo(w * 0.22f, h * 0.50f, w * 0.34f, h * 0.58f, w * 0.53f, h * 0.82f)
            cubicTo(w * 0.72f, h * 1.06f, w * 0.87f, h * 0.99f, w, h * 0.80f)
            lineTo(w, h)
            lineTo(0f, h)
            close()
        }
        drawPath(wave, surface)
    }
}

@Composable
private fun SignInForm(busy: Boolean, onSubmit: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    val remote = BuildConfig.API_ENVIRONMENT == "remote"
    val canSubmit = !busy && isSignInEmail(email, remote) && password.isNotEmpty()
    val submit = {
        if (canSubmit) {
            val submittedPassword = password
            password = ""
            passwordVisible = false
            focus.clearFocus()
            onSubmit(email, submittedPassword)
        }
    }
    val shape = RoundedCornerShape(12.dp)
    val colors = MaterialTheme.colorScheme
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedContainerColor = colors.surfaceVariant.copy(alpha = 0.45f),
        unfocusedContainerColor = colors.surfaceVariant.copy(alpha = 0.45f),
        unfocusedBorderColor = colors.outlineVariant,
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = email,
            onValueChange = { email = it.take(254) },
            modifier = Modifier.fillMaxWidth().semantics {
                contentType = ContentType.Username + ContentType.EmailAddress
            },
            label = { Text(stringResource(R.string.auth_email)) },
            singleLine = true,
            enabled = !busy,
            shape = shape,
            colors = fieldColors,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            supportingText = if (remote) null else ({ Text(stringResource(R.string.auth_test_email)) }),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it.take(1024) },
            modifier = Modifier.fillMaxWidth().semantics { contentType = ContentType.Password },
            label = { Text(stringResource(R.string.auth_password)) },
            enabled = !busy,
            singleLine = true,
            shape = shape,
            colors = fieldColors,
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
            trailingIcon = {
                TextButton(onClick = { passwordVisible = !passwordVisible }, enabled = !busy) {
                    Text(stringResource(if (passwordVisible) R.string.auth_hide else R.string.auth_show))
                }
            },
        )
        Button(
            onClick = submit,
            enabled = canSubmit,
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp).heightIn(min = 50.dp),
            shape = shape,
            colors = ButtonDefaults.buttonColors(
                disabledContainerColor = colors.secondaryContainer,
                disabledContentColor = colors.onSecondaryContainer.copy(alpha = 0.78f),
            ),
        ) {
            Text(stringResource(if (busy) R.string.auth_signing_in else R.string.auth_sign_in))
        }
    }
}

@Composable
private fun AccountHelp() {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        TextButton(onClick = { expanded = !expanded }) {
            Text(stringResource(if (expanded) R.string.auth_hide_help else R.string.auth_help))
        }
        if (expanded) {
            Column(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .background(colors.surfaceVariant).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(stringResource(R.string.auth_recovery_unavailable), style = MaterialTheme.typography.bodyMedium)
                Text(stringResource(R.string.auth_legal_unavailable), style = MaterialTheme.typography.bodyMedium)
            }
        }
        Text(
            stringResource(R.string.auth_registration_closed),
            modifier = Modifier.padding(top = 4.dp),
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
            color = colors.onSurfaceVariant,
        )
    }
}
