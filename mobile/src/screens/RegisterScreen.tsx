import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { register } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const [clinicSlug, setClinicSlug] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { setSession } = useAuth();

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const { token, user, clinic } = await register({
        clinicSlug: clinicSlug.trim(),
        name,
        email,
        phone: phone || undefined,
        password,
      });
      await setSession(token, user, clinic);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>

      <TextInput
        style={styles.input}
        placeholder="Clinic code (e.g. sunrise-clinic)"
        autoCapitalize="none"
        value={clinicSlug}
        onChangeText={setClinicSlug}
      />
      <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
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
        placeholder="Phone"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
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
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create account</Text>}
      </Pressable>

      <Pressable onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', color: colors.teal, marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e2da',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 15,
  },
  button: { backgroundColor: colors.teal, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  link: { color: colors.teal, textAlign: 'center', marginTop: 16 },
  error: { color: '#dc2626', marginBottom: 8, fontSize: 13 },
});
