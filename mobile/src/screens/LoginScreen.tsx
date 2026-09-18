import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { login } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [clinicSlug, setClinicSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { setSession } = useAuth();

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const { token, user, clinic } = await login({ clinicSlug: clinicSlug.trim(), email, password });
      await setSession(token, user, clinic);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OPD Care</Text>
      <Text style={styles.subtitle}>Sign in to book and track your appointments</Text>

      <TextInput
        style={styles.input}
        placeholder="Clinic code (e.g. sunrise-clinic)"
        autoCapitalize="none"
        value={clinicSlug}
        onChangeText={setClinicSlug}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>

      <Pressable onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>New patient? Create an account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', color: colors.teal, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b6b6b', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e2da',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.teal,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  link: { color: colors.teal, textAlign: 'center', marginTop: 16 },
  error: { color: '#dc2626', marginBottom: 8, fontSize: 13 },
});
