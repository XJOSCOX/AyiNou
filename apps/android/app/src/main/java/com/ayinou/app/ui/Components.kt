package com.ayinou.app.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ayinou.app.R

@Composable
internal fun AIcon(@DrawableRes icon: Int, description: String? = null, modifier: Modifier = Modifier) {
    Icon(painterResource(icon), description, modifier.size(22.dp))
}

@Composable
internal fun SectionHeader(label: String) {
    Text(label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
}

@Composable
internal fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    OutlinedCard(modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
internal fun ActionRow(label: String, @DrawableRes icon: Int, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.heightIn(min = 48.dp).padding(horizontal = 10.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AIcon(icon)
            Text(label, Modifier.weight(1f))
            AIcon(R.drawable.ic_chevron_down, modifier = Modifier)
        }
    }
}

@Composable
internal fun Notice(label: String, @DrawableRes icon: Int, error: Boolean = false) {
    val colors = MaterialTheme.colorScheme
    Surface(shape = RoundedCornerShape(10.dp), color = if (error) colors.errorContainer else colors.secondaryContainer,
        contentColor = if (error) colors.onErrorContainer else colors.onSecondaryContainer,
        modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically) {
            AIcon(icon)
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
internal fun Avatar(initials: String, name: String, verified: String? = null) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center) {
            Text(initials, color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.Bold)
        }
        Text(name, style = MaterialTheme.typography.titleSmall)
        if (verified != null) Image(painterResource(R.drawable.member_verified), verified, Modifier.size(18.dp))
    }
}

@Composable
internal fun Skeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.fillMaxWidth(.68f).height(10.dp).clip(RoundedCornerShape(5.dp)).background(MaterialTheme.colorScheme.surfaceVariant))
        Box(Modifier.fillMaxWidth(.45f).height(10.dp).clip(RoundedCornerShape(5.dp)).background(MaterialTheme.colorScheme.surfaceVariant))
    }
}
