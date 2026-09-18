import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { BookAppointmentScreen } from '../screens/BookAppointmentScreen';
import { MyAppointmentsScreen } from '../screens/MyAppointmentsScreen';
import { RecordsScreen } from '../screens/RecordsScreen';
import { colors } from '../theme';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tabs = createBottomTabNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function AppTabs() {
  const { logout, user } = useAuth();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerRight: () => (
          <Pressable onPress={() => logout()} style={{ marginRight: 16 }}>
            <Text style={{ color: colors.teal, fontWeight: '600' }}>Log out</Text>
          </Pressable>
        ),
        tabBarActiveTintColor: colors.teal,
      }}
    >
      <Tabs.Screen
        name="MyAppointments"
        component={MyAppointmentsScreen}
        options={{ title: 'My Appointments', headerTitle: `Hi, ${user?.name?.split(' ')[0] ?? ''}` }}
      />
      <Tabs.Screen name="Book" component={BookAppointmentScreen} options={{ title: 'Book' }} />
      <Tabs.Screen name="Records" component={RecordsScreen} options={{ title: 'Records' }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }

  return <NavigationContainer>{user ? <AppTabs /> : <AuthNavigator />}</NavigationContainer>;
}
